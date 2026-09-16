import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { KeycloakUserService } from '../../../common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../common/types/actor';
import {
  removesActiveManager,
  selfChangeError,
  UserChange,
} from '../domain/user.rules';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserListQueryDto } from '../dto/user-list-query.dto';
import { UserResponseDto } from '../dto/user.response.dto';
import { UserEntity } from '../entities/user.entity';
import { toUserResponse } from '../mappers/user.mapper';
import { UsersRepository } from '../repositories/users.repository';
import { UserRole, UserStatus } from '../user.enums';
import { splitFullName } from '../utils/name';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly keycloakUsers: KeycloakUserService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    actor: Actor,
    query: UserListQueryDto,
  ): Promise<PaginationResponseDto<UserResponseDto>> {
    const [rows, total] = await this.users.listByClub(actor.clubId, query);
    return new PaginationResponseDto(
      rows.map(toUserResponse),
      total,
      query.page,
      query.limit,
    );
  }

  async get(actor: Actor, id: string): Promise<UserResponseDto> {
    return toUserResponse(await this.findInClub(id, actor.clubId));
  }

  async create(actor: Actor, body: CreateUserDto): Promise<UserResponseDto> {
    const email = body.email.trim().toLowerCase();
    const fullName = body.fullName.trim();

    if (await this.users.findByEmail(email, actor.clubId)) {
      throw new ConflictException('Email này đã có trong câu lạc bộ');
    }

    let keycloakId: string;
    try {
      keycloakId = await this.keycloakUsers.registerUserWithPassword({
        username: email,
        email,
        password: body.password,
        ...splitFullName(fullName),
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(
          'Email này đã được dùng cho tài khoản khác',
        );
      }
      throw error;
    }

    try {
      await this.keycloakUsers.assignRealmRole(keycloakId, body.role);
      const created = await this.users.create({
        clubId: actor.clubId,
        keycloakId,
        fullName,
        email,
        role: body.role,
        status: UserStatus.ACTIVE,
        passwordHash: null,
      });
      return toUserResponse(created);
    } catch (error) {
      await this.compensate(keycloakId, email);
      throw error;
    }
  }

  async update(
    actor: Actor,
    id: string,
    body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.findInClub(id, actor.clubId);
    const newRole = body.role;
    const roleChanged = newRole !== undefined && newRole !== user.role;

    if (roleChanged) {
      this.assertChangeAllowed(actor, user, { role: body.role });
      await this.assertRoleReleasable(user);
    }

    const changes: Partial<UserEntity> = {};
    if (body.fullName !== undefined) changes.fullName = body.fullName.trim();
    if (roleChanged) changes.role = body.role;
    if (Object.keys(changes).length === 0) return toUserResponse(user);

    await this.dataSource.transaction(async (manager) => {
      if (roleChanged) await this.lockClub(manager, actor.clubId);
      if (removesActiveManager(user, { role: body.role })) {
        await this.assertAnotherActiveManager(manager, actor.clubId, user.id);
      }
      await this.users.updateFields(id, actor.clubId, changes, manager);
      if (roleChanged && newRole) await this.syncKeycloakRole(user, newRole);
    });

    if (roleChanged) await this.revokeSessions(user);
    return toUserResponse(await this.findInClub(id, actor.clubId));
  }

  async setStatus(
    actor: Actor,
    id: string,
    status: UserStatus,
  ): Promise<UserResponseDto> {
    const user = await this.findInClub(id, actor.clubId);
    if (user.status === status) return toUserResponse(user);
    this.assertChangeAllowed(actor, user, { status });

    await this.dataSource.transaction(async (manager) => {
      await this.lockClub(manager, actor.clubId);
      if (removesActiveManager(user, { status })) {
        await this.assertAnotherActiveManager(manager, actor.clubId, user.id);
      }
      await this.users.updateFields(id, actor.clubId, { status }, manager);
      await this.keycloakUsers.setUserEnabled(
        user.keycloakId,
        status === UserStatus.ACTIVE,
      );
    });

    if (status !== UserStatus.ACTIVE) await this.revokeSessions(user);
    return toUserResponse(await this.findInClub(id, actor.clubId));
  }

  private assertChangeAllowed(
    actor: Actor,
    user: UserEntity,
    change: UserChange,
  ): void {
    const error = selfChangeError(actor.userId, user, change);
    if (error) throw new BadRequestException(error);
  }

  private async assertRoleReleasable(user: UserEntity): Promise<void> {
    if (
      user.role === UserRole.HORSE_OWNER &&
      (await this.users.hasActiveOwnership(user.id))
    ) {
      throw new ConflictException(
        'Người này đang sở hữu ngựa, cần chuyển quyền sở hữu trước khi đổi vai trò',
      );
    }
    if (
      user.role === UserRole.GROOM &&
      (await this.users.hasActiveStableAssignment(user.id))
    ) {
      throw new ConflictException(
        'Người này đang phụ trách chuồng ngựa, cần phân công lại trước khi đổi vai trò',
      );
    }
  }

  private async assertAnotherActiveManager(
    manager: EntityManager,
    clubId: string,
    userId: string,
  ): Promise<void> {
    const others = await this.users.countOtherActiveManagers(
      clubId,
      userId,
      manager,
    );
    if (others === 0) {
      throw new ConflictException(
        'Câu lạc bộ phải còn ít nhất một Club Manager đang hoạt động',
      );
    }
  }

  private async lockClub(
    manager: EntityManager,
    clubId: string,
  ): Promise<void> {
    await manager.query(`SELECT id FROM clubs WHERE id = $1 FOR UPDATE`, [
      clubId,
    ]);
  }

  private async syncKeycloakRole(
    user: UserEntity,
    role: UserRole,
  ): Promise<void> {
    if (user.role) {
      await this.keycloakUsers.removeRealmRole(user.keycloakId, user.role);
    }
    await this.keycloakUsers.assignRealmRole(user.keycloakId, role);
  }

  private async revokeSessions(user: UserEntity): Promise<void> {
    try {
      await this.keycloakUsers.logoutUser(user.keycloakId);
    } catch {
      this.logger.warn(
        `Khong thu hoi duoc phien Keycloak cua ${user.id}; quyen moi van ap dung ngay vi guard doc role tu DB`,
      );
    }
  }

  private async findInClub(id: string, clubId: string): Promise<UserEntity> {
    const user = await this.users.findById(id, clubId);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  private async compensate(keycloakId: string, email: string): Promise<void> {
    try {
      await this.keycloakUsers.deleteUser(keycloakId);
    } catch {
      this.logger.error(
        `User Keycloak mo coi ${keycloakId} (${email}): row local khong tao duoc va lenh xoa bu cung that bai. Vao Admin Console xoa tay.`,
      );
    }
  }
}

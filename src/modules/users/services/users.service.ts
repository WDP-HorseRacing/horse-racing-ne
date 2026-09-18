import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { KeycloakUserService } from '../../../common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../common/types/actor';
import { HorseOwnershipEntity } from '../../horses/entities/horse-ownership.entity';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { StallAssignmentEntity } from '../../stable/entities/stall-assignment.entity';
import {
  getSelfChangeError,
  isRemovingActiveManager,
  UserChange,
} from '../domain/user.rules';
import {
  CreateUserDto,
  UpdateUserDto,
  UserListQueryDto,
  UserResponseDto,
} from '../dto/user.dto';
import { UserEntity } from '../entities/user.entity';
import { toUserResponse } from '../mappers/user.mapper';
import { UserRole, UserStatus } from '../user.enums';
import { currentUserForActor } from '../utils/current-user';
import { splitFullName } from '../utils/name';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly keycloakUsers: KeycloakUserService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * List users
   * @param actor The actor resolved from the JWT
   * @param query The query parameters
   * @returns A promise resolving to a paginated list of users
   */
  async list(
    actor: Actor,
    query: UserListQueryDto,
  ): Promise<PaginationResponseDto<UserResponseDto>> {
    await currentUserForActor(this.dataSource.manager, actor);
    const queryBuilder = this.users.createQueryBuilder('user');
    if (query.role) {
      queryBuilder.andWhere('user.role = :role', { role: query.role });
    }
    if (query.status) {
      queryBuilder.andWhere('user.status = :status', { status: query.status });
    }
    if (query.search) {
      queryBuilder.andWhere(
        '(user.fullName ILIKE :search OR user.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    const [users, total] = await queryBuilder
      .orderBy('user.fullName', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    const items = users.map((user) => toUserResponse(user));

    return new PaginationResponseDto(items, total, query.page, query.limit);
  }

  /**
   * Get a user
   * @param actor The actor resolved from the JWT
   * @param id The ID of the user
   * @returns A promise resolving to the user
   * @throws NotFoundException if the user is not found
   */
  async get(actor: Actor, id: string): Promise<UserResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    return toUserResponse(await this.findUser(id));
  }

  /**
   * Create a user and register them in Keycloak
   * @param actor The actor resolved from the JWT
   * @param body The user data to create
   * @returns A promise resolving to the created user
   * @throws ConflictException if the email is already used locally or in Keycloak
   */
  async create(actor: Actor, body: CreateUserDto): Promise<UserResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const email = body.email.trim().toLowerCase();
    const fullName = body.fullName.trim();

    if (await this.users.findOneBy({ email })) {
      throw new ConflictException('Email này đã được dùng cho tài khoản khác');
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
      const created = await this.users.save(
        this.users.create({
          keycloakId,
          fullName,
          email,
          role: body.role,
          status: UserStatus.ACTIVE,
          passwordHash: null,
        }),
      );
      return toUserResponse(created);
    } catch (error) {
      await this.compensate(keycloakId, email);
      throw error;
    }
  }

  /**
   * Update a user's name or role
   * @param actor The actor resolved from the JWT
   * @param id The ID of the user
   * @param body The fields to update
   * @returns A promise resolving to the updated user
   * @throws NotFoundException if the user is not found
   * @throws BadRequestException if the caller changes their own role
   * @throws ConflictException if the role cannot be released or the club would lose its last active manager
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const user = await this.findUser(id);
    const newRole = body.role;
    const roleChanged = newRole !== undefined && newRole !== user.role;

    if (roleChanged) {
      // Không đổi role của chính mình
      this.assertChangeAllowed(caller.id, user, { role: body.role });
      // Đảm bảo user không còn trách nhiệm nào của role cũ
      // Owner: không còn sở hữu ngựa nào
      // Groom: không còn phụ trách chuồng ngựa nào
      await this.assertRoleReleasable(user);
    }

    const changes: Partial<UserEntity> = {};
    if (body.fullName !== undefined) changes.fullName = body.fullName.trim();
    if (roleChanged) changes.role = body.role;
    if (Object.keys(changes).length === 0) return toUserResponse(user);

    await this.dataSource.transaction(async (manager) => {
      if (roleChanged) await this.lockActiveManagers(manager);
      // Đảm bảo nếu đang đổi role của 1 club manager đang active thì còn ít nhất 1 club manager khác đang active
      // Bỏ trong transaction để tránh race condition với các request khác đang đổi role/status của các club manager khác
      if (isRemovingActiveManager(user, { role: body.role })) {
        await this.assertAnotherActiveManager(manager, user.id);
      }
      await manager.getRepository(UserEntity).update({ id }, changes);
      if (roleChanged && newRole) await this.syncKeycloakRole(user, newRole);
    });

    if (roleChanged) await this.revokeSessions(user);
    return toUserResponse(await this.findUser(id));
  }

  /**
   * Change a user's status and sync it to Keycloak
   * @param actor The actor resolved from the JWT
   * @param id The ID of the user
   * @param status The new status
   * @returns A promise resolving to the updated user
   * @throws NotFoundException if the user is not found
   * @throws BadRequestException if the caller changes their own status
   * @throws ConflictException if the club would lose its last active manager
   */
  async setStatus(
    actor: Actor,
    id: string,
    status: UserStatus,
  ): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const user = await this.findUser(id);
    if (user.status === status) return toUserResponse(user);
    this.assertChangeAllowed(caller.id, user, { status });

    await this.dataSource.transaction(async (manager) => {
      await this.lockActiveManagers(manager);
      // Muốn thay đổi role or status của 1 club manager đang active thì
      // phải đảm bảo còn ít nhất 1 club manager khác đang active
      if (isRemovingActiveManager(user, { status })) {
        // Đảm bảo trong hệ thống còn ít nhất 1 club manager khác đang active
        await this.assertAnotherActiveManager(manager, user.id);
      }
      await manager.getRepository(UserEntity).update({ id }, { status });
      await this.keycloakUsers.setUserEnabled(
        user.keycloakId,
        status === UserStatus.ACTIVE,
      );
    });
    // Nếu status thay đổi sang inactive hoặc locked thì revoke session của user
    if (status !== UserStatus.ACTIVE) await this.revokeSessions(user);
    return toUserResponse(await this.findUser(id));
  }

  /**
   * Ensure the caller is not making a forbidden change to their own account
   * @param callerId The ID of the caller
   * @param user The user being changed
   * @param change The requested change
   * @throws BadRequestException if the change is not allowed
   */
  private assertChangeAllowed(
    callerId: string,
    user: UserEntity,
    change: UserChange,
  ): void {
    const error = getSelfChangeError(callerId, user, change);
    if (error) throw new BadRequestException(error);
  }

  /**
   * Ensure a user has no active horse ownership, stall assignment or barn tied to their current role
   * @param user The user whose role is changing
   * @returns A promise resolving once the check passes
   * @throws ConflictException if the user still holds responsibilities for their current role
   */
  private async assertRoleReleasable(user: UserEntity): Promise<void> {
    if (
      user.role === UserRole.HORSE_OWNER &&
      (await this.hasActiveOwnership(user.id))
    ) {
      throw new ConflictException(
        'Người này đang sở hữu ngựa, cần chuyển quyền sở hữu trước khi đổi vai trò',
      );
    }
    if (
      user.role === UserRole.GROOM &&
      (await this.hasActiveStallAssignment(user.id))
    ) {
      throw new ConflictException(
        'Người này đang phụ trách chuồng ngựa, cần phân công lại trước khi đổi vai trò',
      );
    }
    if (
      user.role === UserRole.HEAD_TRAINER &&
      (await this.hasActiveBarn(user.id))
    ) {
      throw new ConflictException(
        'Người này đang phụ trách khu chuồng, cần giao khu cho Head Trainer khác trước khi đổi vai trò',
      );
    }
  }

  /**
   * Ensure the system keeps at least one other active club manager
   * @param manager The entity manager to run the query with
   * @param userId The ID of the user to exclude
   * @returns A promise resolving once the check passes
   * @throws ConflictException if no other active club manager exists
   */
  private async assertAnotherActiveManager(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const others = await manager.getRepository(UserEntity).count({
      where: {
        id: Not(userId),
        role: UserRole.CLUB_MANAGER,
        status: UserStatus.ACTIVE,
      },
    });
    if (others === 0) {
      throw new ConflictException(
        'Câu lạc bộ phải còn ít nhất một Club Manager đang hoạt động',
      );
    }
  }

  /**
   * Replace a user's realm role in Keycloak
   * @param user The user whose role is changing
   * @param role The new role
   * @returns A promise resolving once the role is synced
   */
  private async syncKeycloakRole(
    user: UserEntity,
    role: UserRole,
  ): Promise<void> {
    if (user.role) {
      await this.keycloakUsers.removeRealmRole(user.keycloakId, user.role);
    }
    await this.keycloakUsers.assignRealmRole(user.keycloakId, role);
  }

  /**
   * Log a user out of all Keycloak sessions, logging a warning on failure
   * @param user The user whose sessions are revoked
   * @returns A promise resolving once the attempt finishes
   */
  private async revokeSessions(user: UserEntity): Promise<void> {
    try {
      await this.keycloakUsers.logoutUser(user.keycloakId);
    } catch {
      this.logger.warn(
        `Khong thu hoi duoc phien Keycloak cua ${user.id}; token cu co the giu quyen den khi het han`,
      );
    }
  }

  /**
   * Find a user by id
   * @param id The ID of the user
   * @returns A promise resolving to the user
   * @throws NotFoundException if the user is not found
   */
  private async findUser(id: string): Promise<UserEntity> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  private async hasActiveOwnership(userId: string): Promise<boolean> {
    return this.dataSource.manager
      .getRepository(HorseOwnershipEntity)
      .existsBy({ ownerId: userId, endDate: IsNull() });
  }

  private async hasActiveStallAssignment(userId: string): Promise<boolean> {
    return this.dataSource.manager
      .getRepository(StallAssignmentEntity)
      .existsBy({ groomId: userId, endAt: IsNull() });
  }

  private async hasActiveBarn(userId: string): Promise<boolean> {
    return this.dataSource.manager
      .getRepository(BarnEntity)
      .existsBy({ headTrainerId: userId });
  }

  private async lockActiveManagers(manager: EntityManager): Promise<void> {
    await manager.getRepository(UserEntity).find({
      select: { id: true },
      where: { role: UserRole.CLUB_MANAGER, status: UserStatus.ACTIVE },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Delete a Keycloak user after local creation fails, logging an error on failure
   * @param keycloakId The Keycloak ID of the user
   * @param email The email of the user
   * @returns A promise resolving once the attempt finishes
   */
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

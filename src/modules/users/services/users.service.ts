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
  getSelfChangeError,
  isRemovingActiveManager,
  UserChange,
} from '../domain/user.rules';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserListQueryDto } from '../dto/user-list-query.dto';
import { UserResponseDto } from '../dto/user.response.dto';
import { ClubEntity } from '../entities/club.entity';
import { UserEntity } from '../entities/user.entity';
import { toUserResponse } from '../mappers/user.mapper';
import { UsersRepository } from '../repositories/users.repository';
import { UserRole, UserStatus } from '../user.enums';
import { currentUserForActor } from '../utils/current-user';
import { splitFullName } from '../utils/name';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly keycloakUsers: KeycloakUserService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * List users in the caller's club
   * @param actor The actor resolved from the JWT
   * @param query The query parameters
   * @returns A promise resolving to a paginated list of users
   */
  async list(
    actor: Actor,
    query: UserListQueryDto,
  ): Promise<PaginationResponseDto<UserResponseDto>> {
    const { clubId } = await currentUserForActor(
      this.dataSource.manager,
      actor,
    );
    const [users, total] = await this.users.listByClub(clubId, query);
    const items = users.map((user) => toUserResponse(user));

    return new PaginationResponseDto(items, total, query.page, query.limit);
  }

  /**
   * Get a user in the caller's club
   * @param actor The actor resolved from the JWT
   * @param id The ID of the user
   * @returns A promise resolving to the user
   * @throws NotFoundException if the user is not in the caller's club
   */
  async get(actor: Actor, id: string): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    return toUserResponse(await this.findInClub(id, caller.clubId));
  }

  /**
   * Create a user in the caller's club and register them in Keycloak
   * @param actor The actor resolved from the JWT
   * @param body The user data to create
   * @returns A promise resolving to the created user
   * @throws ConflictException if the email is already used in the club or in Keycloak
   */
  async create(actor: Actor, body: CreateUserDto): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const email = body.email.trim().toLowerCase();
    const fullName = body.fullName.trim();

    if (await this.users.findByEmail(email, clubId)) {
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
        clubId,
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

  /**
   * Update a user's name or role in the caller's club
   * @param actor The actor resolved from the JWT
   * @param id The ID of the user
   * @param body The fields to update
   * @returns A promise resolving to the updated user
   * @throws NotFoundException if the user is not in the caller's club
   * @throws BadRequestException if the caller changes their own role
   * @throws ConflictException if the role cannot be released or the club would lose its last active manager
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const user = await this.findInClub(id, clubId);
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
      if (roleChanged) await this.lockClubForManagerCheck(manager, clubId);
      // Đảm bảo nếu đang đổi role của 1 club manager đang active thì còn ít nhất 1 club manager khác đang active
      // Bỏ trong transaction để tránh race condition với các request khác đang đổi role/status của các club manager khác
      if (isRemovingActiveManager(user, { role: body.role })) {
        await this.assertAnotherActiveManager(manager, clubId, user.id);
      }
      await this.users.updateFields(id, clubId, changes, manager);
      if (roleChanged && newRole) await this.syncKeycloakRole(user, newRole);
    });

    if (roleChanged) await this.revokeSessions(user);
    return toUserResponse(await this.findInClub(id, clubId));
  }

  /**
   * Change a user's status in the caller's club and sync it to Keycloak
   * @param actor The actor resolved from the JWT
   * @param id The ID of the user
   * @param status The new status
   * @returns A promise resolving to the updated user
   * @throws NotFoundException if the user is not in the caller's club
   * @throws BadRequestException if the caller changes their own status
   * @throws ConflictException if the club would lose its last active manager
   */
  async setStatus(
    actor: Actor,
    id: string,
    status: UserStatus,
  ): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const user = await this.findInClub(id, clubId);
    if (user.status === status) return toUserResponse(user);
    this.assertChangeAllowed(caller.id, user, { status });

    await this.dataSource.transaction(async (manager) => {
      await this.lockClubForManagerCheck(manager, clubId);
      // Muốn thay đổi role or status của 1 club manager đang active thì
      // phải đảm bảo còn ít nhất 1 club manager khác đang active
      if (isRemovingActiveManager(user, { status })) {
        // Đảm bảo trong hệ thống còn ít nhất 1 club manager khác đang active
        await this.assertAnotherActiveManager(manager, clubId, user.id);
      }
      await this.users.updateFields(id, clubId, { status }, manager);
      await this.keycloakUsers.setUserEnabled(
        user.keycloakId,
        status === UserStatus.ACTIVE,
      );
    });
    // Nếu status thay đổi sang inactive hoặc locked thì revoke session của user
    if (status !== UserStatus.ACTIVE) await this.revokeSessions(user);
    return toUserResponse(await this.findInClub(id, clubId));
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
   * Ensure a user has no active horse ownership or stable assignment tied to their current role
   * @param user The user whose role is changing
   * @returns A promise resolving once the check passes
   * @throws ConflictException if the user still holds responsibilities for their current role
   */
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

  /**
   * Ensure the club keeps at least one other active club manager
   * @param manager The entity manager to run the query with
   * @param clubId The ID of the club
   * @param userId The ID of the user to exclude
   * @returns A promise resolving once the check passes
   * @throws ConflictException if no other active club manager exists
   */
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

  /**
   * Lock the club row so concurrent role or status changes cannot remove the last active manager
   * @param manager The entity manager of the current transaction
   * @param clubId The ID of the club
   * @returns A promise resolving once the lock is acquired
   */
  private async lockClubForManagerCheck(
    manager: EntityManager,
    clubId: string,
  ): Promise<void> {
    await manager.getRepository(ClubEntity).findOne({
      select: { id: true },
      where: { id: clubId },
      lock: { mode: 'pessimistic_write' },
    });
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
   * Find a user in a club
   * @param id The ID of the user
   * @param clubId The ID of the club
   * @returns A promise resolving to the user
   * @throws NotFoundException if the user is not found
   */
  private async findInClub(id: string, clubId: string): Promise<UserEntity> {
    const user = await this.users.findById(id, clubId);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
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

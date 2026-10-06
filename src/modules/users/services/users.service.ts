import {
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
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  UserListQueryDto,
  UserResponseDto,
} from '../dto/user.dto';
import { UserEntity } from '../entities/user.entity';
import { toUserResponse } from '../mappers/user.mapper';
import {
  assertNotSelfChange,
  isRemovingActiveManager,
} from '../policies/user.policy';
import { UserRole, UserStatus } from '../user.enums';
import { currentUserForActor } from '../utils/current-user';
import { splitFullName } from '../utils/name';

/**
 * Thao tác bắt user phải bàn giao hết trách nhiệm trước, kèm cụm từ hiển thị trong message lỗi
 */
const RELEASE_ACTION_LABEL = {
  ROLE_CHANGE: 'đổi vai trò',
  DEACTIVATION: 'khóa tài khoản',
} as const;

/**
 * Loại thao tác cần user bàn giao hết trách nhiệm trước khi thực hiện
 */
type ReleaseAction = keyof typeof RELEASE_ACTION_LABEL;

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
   * Liệt kê người dùng, lọc theo vai trò, trạng thái, từ khóa (họ tên hoặc email), sắp theo họ tên
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Bộ lọc và tham số phân trang
   * @returns Promise trả về một trang người dùng
   * @throws ForbiddenException Nếu tài khoản người gọi không tồn tại, không hoạt động hoặc chưa được gán vai trò
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
   * Lấy chi tiết một người dùng
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của user
   * @returns Promise trả về user
   * @throws ForbiddenException Nếu tài khoản người gọi không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có user
   */
  async get(actor: Actor, id: string): Promise<UserResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    return toUserResponse(await this.findUser(id));
  }

  /**
   * Tạo user và đăng ký tài khoản tương ứng trên Keycloak
   *
   * - Gán vai trò trên Keycloak hoặc ghi DB lỗi: xóa tài khoản Keycloak vừa tạo rồi ném lại lỗi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Dữ liệu user cần tạo
   * @returns Promise trả về user vừa tạo
   * @throws ForbiddenException Nếu tài khoản người gọi không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws ConflictException Nếu email đã được dùng ở DB hoặc trên Keycloak
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
   * Sửa họ tên hoặc vai trò của user
   *
   * - Đổi vai trò: đồng bộ sang Keycloak sau khi commit rồi thu hồi phiên đăng nhập của user
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của user
   * @param body Các field cần sửa
   * @returns Promise trả về user sau khi sửa
   * @throws ForbiddenException Nếu tài khoản người gọi không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có user
   * @throws BadRequestException Nếu người gọi tự đổi vai trò của chính mình
   * @throws ConflictException Nếu user còn trách nhiệm của vai trò hiện tại hoặc câu lạc bộ không còn Club Manager đang hoạt động nào khác
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const newRole = body.role;

    const previous = await this.dataSource.transaction(async (manager) => {
      if (newRole !== undefined) await this.lockActiveManagers(manager);
      const user = await this.lockUser(manager, id);
      const roleChanged = newRole !== undefined && newRole !== user.role;

      if (roleChanged) {
        assertNotSelfChange(caller.id, user, { role: newRole });
        await this.assertResponsibilitiesReleased(manager, user, 'ROLE_CHANGE');
      }

      const changes: Partial<UserEntity> = {};
      if (body.fullName !== undefined) changes.fullName = body.fullName.trim();
      if (roleChanged) changes.role = newRole;
      if (Object.keys(changes).length === 0) return user;

      if (isRemovingActiveManager(user, { role: newRole })) {
        await this.assertAnotherActiveManager(manager, user.id);
      }
      await manager.getRepository(UserEntity).update({ id }, changes);
      return user;
    });

    if (newRole !== undefined && newRole !== previous.role) {
      await this.syncRoleAfterCommit(previous, newRole);
      await this.revokeSessions(previous);
    }
    return toUserResponse(await this.findUser(id));
  }

  /**
   * Đổi trạng thái tài khoản của user và đồng bộ sang Keycloak
   *
   * - Trạng thái không đổi: trả user hiện tại, không ghi gì
   * - Chuyển sang trạng thái khác ACTIVE: thu hồi phiên đăng nhập của user
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của user
   * @param status Trạng thái mới
   * @returns Promise trả về user sau khi đổi
   * @throws ForbiddenException Nếu tài khoản người gọi không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có user
   * @throws BadRequestException Nếu người gọi tự đổi trạng thái của chính mình
   * @throws ConflictException Nếu user còn trách nhiệm của vai trò hiện tại hoặc câu lạc bộ không còn Club Manager đang hoạt động nào khác
   */
  async setStatus(
    actor: Actor,
    id: string,
    status: UserStatus,
  ): Promise<UserResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const previous = await this.dataSource.transaction(async (manager) => {
      await this.lockActiveManagers(manager);
      const user = await this.lockUser(manager, id);
      if (user.status === status) return user;

      assertNotSelfChange(caller.id, user, { status });
      if (status !== UserStatus.ACTIVE) {
        await this.assertResponsibilitiesReleased(
          manager,
          user,
          'DEACTIVATION',
        );
      }
      if (isRemovingActiveManager(user, { status })) {
        await this.assertAnotherActiveManager(manager, user.id);
      }
      await manager.getRepository(UserEntity).update({ id }, { status });
      return user;
    });

    if (previous.status === status) return toUserResponse(previous);
    await this.syncStatusAfterCommit(previous, status);
    if (status !== UserStatus.ACTIVE) await this.revokeSessions(previous);
    return toUserResponse(await this.findUser(id));
  }

  /**
   * Khóa row user (SELECT ... FOR UPDATE) trong transaction đang chạy
   *
   * @param manager EntityManager của transaction đang chạy
   * @param id UUID của user cần khóa
   * @returns Promise trả về user đã được khóa
   * @throws NotFoundException Nếu không có user với id này (hoặc đã bị xóa mềm)
   */
  private async lockUser(
    manager: EntityManager,
    id: string,
  ): Promise<UserEntity> {
    const user = await manager.getRepository(UserEntity).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  /**
   * Đảm bảo user không còn trách nhiệm nào gắn với vai trò hiện tại trước khi đổi vai trò hoặc khóa tài khoản
   *
   * - Horse Owner: không còn là chủ của ngựa nào đang ở câu lạc bộ
   * - Groom: không còn phụ trách ngựa nào (groom assignment chưa kết thúc)
   * - Head Trainer: không còn phụ trách khu chuồng nào
   *
   * @param manager EntityManager của transaction đang chạy, user đã được khóa bằng manager này
   * @param user User sắp đổi vai trò hoặc sắp bị khóa
   * @param action Thao tác đang làm, quyết định cụm "trước khi ..." trong message lỗi
   * @returns Promise hoàn tất khi kiểm tra đạt
   * @throws ConflictException Nếu user còn trách nhiệm của vai trò hiện tại
   */
  private async assertResponsibilitiesReleased(
    manager: EntityManager,
    user: UserEntity,
    action: ReleaseAction,
  ): Promise<void> {
    const label = RELEASE_ACTION_LABEL[action];
    if (
      user.role === UserRole.HORSE_OWNER &&
      (await this.hasActiveOwnership(manager, user.id))
    ) {
      throw new ConflictException(
        `Người này đang là chủ của ngựa còn ở câu lạc bộ, cần đổi chủ trước khi ${label}`,
      );
    }
    if (
      user.role === UserRole.GROOM &&
      (await this.hasActiveGroomAssignment(manager, user.id))
    ) {
      throw new ConflictException(
        `Người này đang phụ trách ngựa, cần giao ngựa cho groom khác trước khi ${label}`,
      );
    }
    if (
      user.role === UserRole.HEAD_TRAINER &&
      (await this.hasActiveBarn(manager, user.id))
    ) {
      throw new ConflictException(
        `Người này đang phụ trách khu chuồng, cần giao khu cho Huấn luyện viên trưởng khác trước khi ${label}`,
      );
    }
  }

  /**
   * Bắt buộc câu lạc bộ còn ít nhất một Club Manager đang hoạt động khác ngoài user này
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userId UUID của user cần loại trừ
   * @returns Promise hoàn tất khi kiểm tra đạt
   * @throws ConflictException Nếu không còn Club Manager đang hoạt động nào khác
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
   * Thay vai trò realm của user trên Keycloak: gỡ vai trò cũ rồi gán vai trò mới
   *
   * - Gán vai trò mới lỗi sau khi đã gỡ vai trò cũ: gán lại vai trò cũ, rồi ném lại lỗi gốc
   * - Gán lại vai trò cũ cũng lỗi: chỉ ghi log error (kèm keycloakId và vai trò cần gán lại), vẫn ném lỗi gốc
   *
   * @param user User đang giữ vai trò cũ
   * @param role Vai trò mới
   * @returns Promise hoàn tất khi Keycloak đã nhận vai trò mới
   * @throws Error Lỗi gốc từ Keycloak khi gỡ vai trò cũ hoặc gán vai trò mới
   */
  private async syncKeycloakRole(
    user: UserEntity,
    role: UserRole,
  ): Promise<void> {
    if (user.role) {
      await this.keycloakUsers.removeRealmRole(user.keycloakId, user.role);
    }
    try {
      await this.keycloakUsers.assignRealmRole(user.keycloakId, role);
    } catch (error) {
      if (user.role) {
        await this.restoreKeycloakRole(user.keycloakId, user.role);
      }
      throw error;
    }
  }

  /**
   * Gán lại vai trò cũ trên Keycloak khi đổi vai trò thất bại giữa chừng, lỗi thì chỉ ghi log
   *
   * @param keycloakId Id của user trên Keycloak
   * @param role Vai trò cũ cần gán lại
   * @returns Promise hoàn tất khi đã gán lại hoặc đã ghi log lỗi
   */
  private async restoreKeycloakRole(
    keycloakId: string,
    role: UserRole,
  ): Promise<void> {
    try {
      await this.keycloakUsers.assignRealmRole(keycloakId, role);
    } catch (error) {
      this.logger.error(
        `Không gán lại được vai trò ${role} cho Keycloak user ${keycloakId} sau khi đổi vai trò lỗi, cần gán tay: ${String(error)}`,
      );
    }
  }

  /**
   * Đồng bộ vai trò mới sang Keycloak sau khi DB đã commit; Keycloak lỗi thì hoàn tác vai trò trong DB rồi ném lại lỗi
   *
   * - Hoàn tác chạy trong transaction mới, xem revertCommittedChange
   * - Keycloak đã gỡ vai trò cũ mà gán vai trò mới lỗi thì syncKeycloakRole gán lại vai trò cũ
   *
   * @param previous User đọc được trong transaction, còn giữ vai trò cũ
   * @param role Vai trò mới đã ghi vào DB
   * @returns Promise hoàn tất khi Keycloak đã nhận vai trò mới
   * @throws Error Lỗi gốc từ Keycloak, ném lại sau khi đã thử hoàn tác DB
   */
  private async syncRoleAfterCommit(
    previous: UserEntity,
    role: UserRole,
  ): Promise<void> {
    try {
      await this.syncKeycloakRole(previous, role);
    } catch (error) {
      await this.revertCommittedChange(
        previous.id,
        { role },
        { role: previous.role },
      );
      throw error;
    }
  }

  /**
   * Bật/tắt tài khoản Keycloak theo trạng thái mới sau khi DB đã commit; Keycloak lỗi thì hoàn tác trạng thái trong DB rồi ném lại lỗi
   *
   * @param previous User đọc được trong transaction, còn giữ trạng thái cũ
   * @param status Trạng thái mới đã ghi vào DB
   * @returns Promise hoàn tất khi Keycloak đã nhận trạng thái mới
   * @throws Error Lỗi gốc từ Keycloak, ném lại sau khi đã thử hoàn tác DB
   */
  private async syncStatusAfterCommit(
    previous: UserEntity,
    status: UserStatus,
  ): Promise<void> {
    try {
      await this.keycloakUsers.setUserEnabled(
        previous.keycloakId,
        status === UserStatus.ACTIVE,
      );
    } catch (error) {
      await this.revertCommittedChange(
        previous.id,
        { status },
        { status: previous.status },
      );
      throw error;
    }
  }

  /**
   * Bù trừ một thay đổi vai trò/trạng thái đã commit khi Keycloak không đồng bộ được, lỗi thì chỉ log
   *
   * - Chạy trong transaction mới
   * - Chỉ ghi đè khi row vẫn còn đúng giá trị vừa ghi
   * - Lỗi khi hoàn tác chỉ ghi log, không ném ra
   *
   * @param id UUID của user cần hoàn tác
   * @param applied Giá trị đã commit (dùng làm điều kiện WHERE)
   * @param original Giá trị trước khi đổi, sẽ được ghi lại
   * @returns Promise hoàn tất khi lần hoàn tác kết thúc (thành công hoặc đã log lỗi)
   */
  private async revertCommittedChange(
    id: string,
    applied: { role?: UserRole; status?: UserStatus },
    original: Partial<Pick<UserEntity, 'role' | 'status'>>,
  ): Promise<void> {
    try {
      await this.dataSource.transaction((manager) =>
        manager.getRepository(UserEntity).update({ id, ...applied }, original),
      );
    } catch {
      this.logger.error(
        `Keycloak khong dong bo duoc va hoan tac DB cua user ${id} cung that bai: DB dang giu ${JSON.stringify(applied)}, can sua tay ve ${JSON.stringify(original)}.`,
      );
    }
  }

  /**
   * Đăng xuất user khỏi mọi phiên Keycloak, lỗi thì chỉ ghi log warning
   *
   * @param user User cần thu hồi phiên
   * @returns Promise hoàn tất khi lần thu hồi kết thúc (thành công hoặc đã log lỗi)
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
   * Tìm user theo id
   *
   * @param id UUID của user
   * @returns Promise trả về user
   * @throws NotFoundException Nếu không có user
   */
  private async findUser(id: string): Promise<UserEntity> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  /**
   * Kiểm tra Horse Owner còn là chủ của con ngựa nào đang ở câu lạc bộ không (theo horses.owner_id).
   *
   * - Chỉ tính ngựa ACTIVE hoặc RETIRED; ngựa TRANSFERRED không tính.
   * - Hồ sơ đã xóa mềm không tính.
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userId UUID của Horse Owner
   * @returns Promise trả về true nếu còn ít nhất một ngựa ACTIVE/RETIRED chưa xóa mềm có owner_id là userId
   */
  private async hasActiveOwnership(
    manager: EntityManager,
    userId: string,
  ): Promise<boolean> {
    return manager.getRepository(HorseEntity).existsBy({
      ownerId: userId,
      lifecycleStatus: Not(HorseLifecycleStatus.TRANSFERRED),
    });
  }

  /**
   * Kiểm tra Groom còn đang phụ trách con ngựa nào không (groom assignment chưa có end_at)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userId UUID của Groom
   * @returns Promise trả về true nếu còn ít nhất một groom assignment đang mở
   */
  private async hasActiveGroomAssignment(
    manager: EntityManager,
    userId: string,
  ): Promise<boolean> {
    return manager
      .getRepository(GroomAssignmentEntity)
      .existsBy({ groomId: userId, endAt: IsNull() });
  }

  /**
   * Kiểm tra Head Trainer còn phụ trách khu chuồng nào không (barns.head_trainer_id)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userId UUID của Head Trainer
   * @returns Promise trả về true nếu còn ít nhất một khu chuồng do người này phụ trách
   */
  private async hasActiveBarn(
    manager: EntityManager,
    userId: string,
  ): Promise<boolean> {
    return manager
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
   * Xóa tài khoản Keycloak vừa tạo khi tạo user ở DB thất bại, lỗi thì chỉ ghi log error
   *
   * @param keycloakId Keycloak ID của tài khoản cần xóa
   * @param email Email của tài khoản, dùng trong log
   * @returns Promise hoàn tất khi lần xóa kết thúc (thành công hoặc đã log lỗi)
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

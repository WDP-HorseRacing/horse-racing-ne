import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { UserEntity } from '../../users/entities/user.entity';
import {
  type CurrentActorUser,
  currentUserForActor,
} from '../../users/utils/current-user';
import {
  DELETED_HORSE_READ_ONLY_MESSAGE,
  HORSE_NOT_FOUND_MESSAGE,
} from '../constants/horse.constants';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import { HorseEntity } from '../entities/horse.entity';
import { isActiveHorseOwner, isHorseInScope } from '../policies/horse.policy';
import type { HorseScope } from '../types/horse.types';

/**
 * Các kiểm tra người gọi và con ngựa dùng chung cho mọi feature của module horses và cho module khác (export qua HorsesSharedModule).
 *
 * - Xem (404 khi ngoài phạm vi): findReadableHorseForActor, findReadableHorse
 * - Ghi (409 hồ sơ đã xóa với Club Manager, 404 với vai trò khác): lockWritableHorse, findWritableHorse, lockWritableHorseInScope
 * - Phạm vi Head Trainer theo khu: isHorseInTrainerBarn, assertTrainerBarn
 * - Đọc và khóa dùng chung: findById, findByIdWithDeleted, lockHorseWithDeleted, hasActiveTrainingLock, isGroomAssigned, lockActiveHorseOwner, invalidOwnerName
 */
@Injectable()
export class HorseAccessService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lấy user hiện tại từ token của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param manager EntityManager của transaction đang chạy, mặc định dùng manager ngoài transaction
   * @returns Promise trả về user hiện tại
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  currentUser(
    actor: Actor,
    manager = this.dataSource.manager,
  ): Promise<CurrentActorUser> {
    return currentUserForActor(manager, actor);
  }

  /**
   * Tìm con ngựa người gọi được xem, tự lấy user hiện tại từ token
   *
   * - Luật xem giống findReadableHorse
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param manager EntityManager dùng để query, mặc định dùng manager ngoài transaction
   * @returns Promise trả về con ngựa người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async findReadableHorseForActor(
    actor: Actor,
    horseId: string,
    manager = this.dataSource.manager,
  ): Promise<HorseEntity> {
    const caller = await this.currentUser(actor, manager);
    return this.findReadableHorse(manager, actor, caller.id, horseId);
  }

  /**
   * Tìm con ngựa mà người gọi được xem dữ liệu. Dùng chung cho mọi module hiển thị dữ liệu của một con ngựa
   *
   * - Club Manager: xem được cả hồ sơ đã xóa
   * - Head Trainer, Veterinarian, Groom: mọi ngựa trong CLB, trừ hồ sơ đã xóa
   * - Horse Owner: chỉ ngựa mình đang là chủ (horses.owner_id)
   *
   * @param manager EntityManager dùng để query
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi (users.id)
   * @param horseId UUID của ngựa
   * @returns Promise trả về con ngựa người gọi được xem
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi
   */
  async findReadableHorse(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<HorseEntity> {
    const horse = this.hasRole(actor, UserRole.CLUB_MANAGER)
      ? await this.findByIdWithDeleted(horseId, manager)
      : await this.findById(horseId, manager);
    if (!horse || !isHorseInScope(horse, this.scopeOf(actor, callerId))) {
      throw new NotFoundException(HORSE_NOT_FOUND_MESSAGE);
    }
    return horse;
  }

  /**
   * Lấy user hiện tại, khóa row con ngựa rồi kiểm lại phạm vi xem, dùng trước thao tác ghi trong transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về user hiện tại và con ngựa đã khóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws ConflictException Nếu Club Manager thao tác hồ sơ đã xóa
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa (vai trò khác Club Manager), hoặc ngựa nằm ngoài phạm vi
   */
  async lockWritableHorseInScope(
    manager: EntityManager,
    actor: Actor,
    horseId: string,
  ): Promise<{ caller: CurrentActorUser; horse: HorseEntity }> {
    const caller = await this.currentUser(actor, manager);
    const horse = await this.lockWritableHorse(manager, actor, horseId);
    if (!isHorseInScope(horse, this.scopeOf(actor, caller.id))) {
      throw new NotFoundException(HORSE_NOT_FOUND_MESSAGE);
    }
    return { caller, horse };
  }

  /**
   * Khóa row con ngựa (pessimistic_write) để thực hiện thao tác ghi. Dùng chung cho mọi thao tác ghi trong transaction
   *
   * - Tải kèm hồ sơ đã xóa mềm, phân biệt "không có" với "đã xóa"
   * - Hồ sơ đã xóa + người gọi có vai trò Club Manager: 409, phải khôi phục trước khi thao tác
   * - Hồ sơ đã xóa + vai trò khác: 404 (hồ sơ nằm ngoài phạm vi xem)
   * - Không kiểm phạm vi Horse Owner và các luật riêng của thao tác; nơi gọi tự kiểm
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về con ngựa đã khóa, chắc chắn chưa bị xóa
   * @throws NotFoundException Nếu không có ngựa, hoặc hồ sơ đã xóa và người gọi không phải Club Manager
   * @throws ConflictException Nếu hồ sơ đã xóa và người gọi là Club Manager
   */
  async lockWritableHorse(
    manager: EntityManager,
    actor: Actor,
    horseId: string,
  ): Promise<HorseEntity> {
    return this.ensureNotDeleted(
      actor,
      await this.lockHorseWithDeleted(manager, horseId),
    );
  }

  /**
   * Tìm con ngựa (không khóa row) để chuẩn bị thao tác ghi. Cùng luật 409/404 với lockWritableHorse, dùng cho thao tác kiểm tra ngoài transaction rồi mới ghi (vd sửa hồ sơ có version, xem trước đổi vòng đời)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về con ngựa, chắc chắn chưa bị xóa
   * @throws NotFoundException Nếu không có ngựa, hoặc hồ sơ đã xóa và người gọi không phải Club Manager
   * @throws ConflictException Nếu hồ sơ đã xóa và người gọi là Club Manager
   */
  async findWritableHorse(actor: Actor, horseId: string): Promise<HorseEntity> {
    return this.ensureNotDeleted(
      actor,
      await this.findByIdWithDeleted(horseId),
    );
  }

  /**
   * Tìm con ngựa theo id, bỏ qua hồ sơ đã xóa. Dùng để đọc lại hồ sơ sau khi ghi
   *
   * @param id UUID của ngựa
   * @param manager EntityManager dùng để query, mặc định dùng manager ngoài transaction
   * @returns Promise trả về con ngựa
   * @throws NotFoundException Nếu không có ngựa hoặc hồ sơ đã xóa
   */
  async findNotDeletedHorse(
    id: string,
    manager = this.dataSource.manager,
  ): Promise<HorseEntity> {
    const horse = await this.findById(id, manager);
    if (!horse) throw new NotFoundException(HORSE_NOT_FOUND_MESSAGE);
    return horse;
  }

  /**
   * Kiểm tra con ngựa có đang thuộc một khu do Head Trainer này phụ trách không
   *
   * - Khu của ngựa lấy từ horses.barn_id, không suy ra từ ô chuồng
   * - Ngựa chưa được xếp khu thì không thuộc Head Trainer nào
   * - Hồ sơ đã xóa hoặc khu đã xóa thì coi như không thuộc
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param horseId UUID của ngựa
   * @param trainerId UUID của Head Trainer
   * @returns Promise trả về true nếu ngựa đang ở một khu có head_trainer_id là trainerId
   */
  isHorseInTrainerBarn(
    manager: EntityManager,
    horseId: string,
    trainerId: string,
  ): Promise<boolean> {
    return manager
      .getRepository(HorseEntity)
      .createQueryBuilder('horse')
      .innerJoin('horse.barn', 'barn', 'barn.deletedAt IS NULL')
      .where('horse.id = :horseId', { horseId })
      .andWhere('barn.headTrainerId = :trainerId', { trainerId })
      .getExists();
  }

  /**
   * Chặn Head Trainer thao tác trên ngựa ngoài khu mình phụ trách. Vai trò khác đi qua, quyền riêng của vai trò đó do nơi gọi tự kiểm
   *
   * - Người có cả vai trò Club Manager thì không bị giới hạn theo khu
   * - Chỉ dùng cho thao tác (403). Việc xem hồ sơ do findReadableHorse quyết định (404)
   *
   * @param manager EntityManager dùng để query
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horseId UUID của ngựa
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws ForbiddenException Nếu người gọi là Head Trainer và ngựa không thuộc khu mình phụ trách
   */
  async assertTrainerBarn(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<void> {
    if (
      !this.hasRole(actor, UserRole.HEAD_TRAINER) ||
      this.hasRole(actor, UserRole.CLUB_MANAGER)
    ) {
      return;
    }
    if (!(await this.isHorseInTrainerBarn(manager, horseId, callerId))) {
      throw new ForbiddenException('Ngựa không thuộc khu bạn phụ trách');
    }
  }

  /**
   * Tìm con ngựa theo id, bỏ qua hồ sơ đã xóa mềm
   *
   * @param id UUID của ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns Promise trả về con ngựa, hoặc null nếu không có hoặc đã xóa
   */
  findById(id: string, manager?: EntityManager): Promise<HorseEntity | null> {
    return (manager ?? this.dataSource.manager).findOneBy(HorseEntity, { id });
  }

  /**
   * Tìm con ngựa theo id, kể cả hồ sơ đã xóa mềm. Nơi gọi tự quyết định xử lý hồ sơ đã xóa (xem findWritableHorse)
   *
   * @param id UUID của ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns Promise trả về con ngựa (deletedAt khác null nếu đã xóa), hoặc null nếu không có
   */
  findByIdWithDeleted(
    id: string,
    manager?: EntityManager,
  ): Promise<HorseEntity | null> {
    return (manager ?? this.dataSource.manager).findOne(HorseEntity, {
      where: { id },
      withDeleted: true,
    });
  }

  /**
   * Tìm con ngựa kể cả hồ sơ đã xóa và khóa row của nó (pessimistic_write) tới hết transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise trả về con ngựa đã khóa, hoặc null nếu không có
   */
  lockHorseWithDeleted(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseEntity | null> {
    return manager.findOne(HorseEntity, {
      where: { id: horseId },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Lọc ra những con ngựa đang có lệnh khóa huấn luyện ACTIVE (bảng training_locks của module medical, chỉ đọc)
   *
   * @param horseIds UUID các con ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns Promise trả về tập UUID các con ngựa đang bị khóa huấn luyện
   */
  async activeTrainingLockHorseIds(
    horseIds: string[],
    manager?: EntityManager,
  ): Promise<Set<string>> {
    if (horseIds.length === 0) return new Set();
    const locks = await (manager ?? this.dataSource.manager).find(
      TrainingLockEntity,
      {
        select: { horseId: true },
        where: { horseId: In(horseIds), status: TrainingLockStatus.ACTIVE },
      },
    );
    return new Set(locks.map((lock) => lock.horseId));
  }

  /**
   * Kiểm tra con ngựa có đang bị khóa huấn luyện (lệnh khóa ACTIVE) không
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns Promise trả về true nếu ngựa đang có lệnh khóa ACTIVE
   */
  async hasActiveTrainingLock(
    horseId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return (await this.activeTrainingLockHorseIds([horseId], manager)).has(
      horseId,
    );
  }

  /**
   * Kiểm tra groom có đang được giao chăm con ngựa không (dòng groom_assignments còn mở, bảng của module stable, chỉ đọc)
   *
   * @param horseId UUID của ngựa
   * @param groomId UUID của groom
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns Promise trả về true nếu groom đang phụ trách con ngựa này
   */
  isGroomAssigned(
    horseId: string,
    groomId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return (manager ?? this.dataSource.manager).existsBy(
      GroomAssignmentEntity,
      { horseId, groomId, endAt: IsNull() },
    );
  }

  /**
   * Khóa chia sẻ (FOR SHARE) row tài khoản được chọn làm chủ ngựa tới hết transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param ownerId UUID tài khoản được chọn
   * @returns Promise trả về tài khoản (vai trò, trạng thái), hoặc null nếu không có
   */
  lockOwnerAccount(
    manager: EntityManager,
    ownerId: string,
  ): Promise<UserEntity | null> {
    return manager.findOne(UserEntity, {
      where: { id: ownerId },
      lock: { mode: 'pessimistic_read' },
    });
  }

  /**
   * Khóa chia sẻ row tài khoản chủ (FOR SHARE) rồi kiểm tài khoản đó có đang là HORSE_OWNER hoạt động không (bảng users, chỉ đọc)
   *
   * - Khóa giữ tới hết transaction
   * - Chỉ gọi trong transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param ownerId UUID tài khoản cần kiểm
   * @returns Promise trả về true nếu tài khoản tồn tại, có role HORSE_OWNER và đang ACTIVE
   */
  async lockActiveHorseOwner(
    manager: EntityManager,
    ownerId: string,
  ): Promise<boolean> {
    return isActiveHorseOwner(await this.lockOwnerAccount(manager, ownerId));
  }

  /**
   * Lấy tên chủ của ngựa nếu tài khoản đó không còn là HORSE_OWNER hoạt động (chỉ đọc)
   *
   * @param ownerId UUID tài khoản chủ
   * @param manager EntityManager dùng để query, bỏ trống khi không ở trong transaction
   * @returns Promise trả về tên chủ nếu chủ không còn hợp lệ, null nếu chủ vẫn hợp lệ hoặc không tìm thấy
   */
  async invalidOwnerName(
    ownerId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const owner = await (manager ?? this.dataSource.manager).findOneBy(
      UserEntity,
      { id: ownerId },
    );
    if (!owner) return null;
    return isActiveHorseOwner(owner) ? null : owner.fullName;
  }

  /**
   * Xác định phạm vi ngựa người gọi được xem, dựa vào role. Chỉ Horse Owner bị giới hạn
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param userId UUID của người gọi
   * @returns Phạm vi OWNER cho Horse Owner, còn lại là ALL
   */
  scopeOf(actor: Actor, userId: string): HorseScope {
    return this.hasRole(actor, UserRole.HORSE_OWNER)
      ? { kind: 'OWNER', userId }
      : { kind: 'ALL' };
  }

  /**
   * Kiểm tra người gọi có ít nhất một trong các vai trò cho trước
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param roles Các vai trò cần kiểm
   * @returns true nếu người gọi có ít nhất một vai trò
   */
  hasRole(actor: Actor, ...roles: UserRole[]): boolean {
    return roles.some((role) => actor.roles.includes(role));
  }

  /**
   * Chặn thao tác ghi trên hồ sơ không có hoặc đã xóa mềm, chọn 409 hay 404 theo vai trò người gọi.
   *
   * - Club Manager: hồ sơ đã xóa trả 409
   * - Vai trò khác: hồ sơ đã xóa trả 404 như không tồn tại
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horse Con ngựa đã tải kèm hồ sơ đã xóa, hoặc null nếu không có
   * @returns Con ngựa chưa bị xóa
   * @throws NotFoundException Nếu không có ngựa, hoặc hồ sơ đã xóa và người gọi không phải Club Manager
   * @throws ConflictException Nếu hồ sơ đã xóa và người gọi là Club Manager
   */
  private ensureNotDeleted(
    actor: Actor,
    horse: HorseEntity | null,
  ): HorseEntity {
    if (!horse) throw new NotFoundException(HORSE_NOT_FOUND_MESSAGE);
    if (!horse.deletedAt) return horse;
    if (this.hasRole(actor, UserRole.CLUB_MANAGER)) {
      throw new ConflictException(DELETED_HORSE_READ_ONLY_MESSAGE);
    }
    throw new NotFoundException(HORSE_NOT_FOUND_MESSAGE);
  }
}

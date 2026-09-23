import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  type CurrentActorUser,
  currentUserForActor,
} from '../../users/utils/current-user';
import { DELETED_HORSE_READ_ONLY_MESSAGE } from '../constants/horse.constants';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import { HorseEntity } from '../entities/horse.entity';
import { isHorseInScope } from '../policies/horse.policy';
import type { HorseScope } from '../types/horse.types';
import { HorsesSharedRepository } from './horses-shared.repository';

/**
 * Các kiểm tra người gọi và con ngựa dùng chung cho mọi feature của module horses và cho module khác (export qua HorsesSharedModule).
 *
 * - Xem (404 khi ngoài phạm vi): findReadable, findReadableHorse
 * - Ghi (403 hồ sơ đã xóa với Club Manager, 404 với vai trò khác): lockWritableHorse, findWritableHorse, lockVisibleHorse
 * - Phạm vi Head Trainer theo khu: isHorseInTrainerBarn, assertTrainerBarn
 */
@Injectable()
export class HorseAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly horses: HorsesSharedRepository,
  ) {}

  /**
   * Lấy user hiện tại từ token của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param manager EntityManager của transaction đang chạy, mặc định dùng manager ngoài transaction
   * @returns A promise resolving to user hiện tại
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
   * @returns A promise resolving to con ngựa người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async findReadable(
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
   * @returns A promise resolving to con ngựa người gọi được xem
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi (báo 'không tìm thấy' để không lộ là ngựa có tồn tại)
   */
  async findReadableHorse(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<HorseEntity> {
    const horse = this.hasRole(actor, UserRole.CLUB_MANAGER)
      ? await this.horses.findByIdWithDeleted(horseId, manager)
      : await this.horses.findById(horseId, manager);
    if (!horse || !isHorseInScope(horse, this.scopeOf(actor, callerId))) {
      throw new NotFoundException('Không tìm thấy ngựa');
    }
    return horse;
  }

  /**
   * Lấy user hiện tại, khóa row con ngựa rồi kiểm lại phạm vi xem, dùng trước thao tác ghi trong transaction
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param manager EntityManager của transaction đang chạy
   * @returns A promise resolving to user hiện tại và con ngựa đã khóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc Club Manager thao tác hồ sơ đã xóa
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa (vai trò khác Club Manager), hoặc ngựa nằm ngoài phạm vi
   */
  async lockVisibleHorse(
    actor: Actor,
    horseId: string,
    manager: EntityManager,
  ): Promise<{ caller: CurrentActorUser; horse: HorseEntity }> {
    const caller = await this.currentUser(actor, manager);
    const horse = await this.lockWritableHorse(manager, actor, horseId);
    if (!isHorseInScope(horse, this.scopeOf(actor, caller.id))) {
      throw new NotFoundException('Không tìm thấy ngựa');
    }
    return { caller, horse };
  }

  /**
   * Khóa row con ngựa (pessimistic_write) để thực hiện thao tác ghi. Dùng chung cho mọi thao tác ghi trong transaction
   *
   * - Tải kèm hồ sơ đã xóa mềm để phân biệt "không có" với "đã xóa"
   * - Hồ sơ đã xóa + người gọi có vai trò Club Manager: 403 (Club Manager xem được hồ sơ đã xóa nhưng phải khôi phục trước khi thao tác, mục III.1 và III.6.3)
   * - Hồ sơ đã xóa + vai trò khác: 404 (hồ sơ nằm ngoài phạm vi xem)
   * - Không kiểm phạm vi Horse Owner và các luật riêng của thao tác; nơi gọi tự kiểm
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to con ngựa đã khóa, chắc chắn chưa bị xóa
   * @throws NotFoundException Nếu không có ngựa, hoặc hồ sơ đã xóa và người gọi không phải Club Manager
   * @throws ForbiddenException Nếu hồ sơ đã xóa và người gọi là Club Manager
   */
  async lockWritableHorse(
    manager: EntityManager,
    actor: Actor,
    horseId: string,
  ): Promise<HorseEntity> {
    return this.ensureNotDeleted(
      actor,
      await this.horses.lockHorseWithDeleted(manager, horseId),
    );
  }

  /**
   * Tìm con ngựa (không khóa row) để chuẩn bị thao tác ghi. Cùng luật 403/404 với lockWritableHorse, dùng cho thao tác kiểm tra ngoài transaction rồi mới ghi (vd sửa hồ sơ có version, xem trước đổi vòng đời)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to con ngựa, chắc chắn chưa bị xóa
   * @throws NotFoundException Nếu không có ngựa, hoặc hồ sơ đã xóa và người gọi không phải Club Manager
   * @throws ForbiddenException Nếu hồ sơ đã xóa và người gọi là Club Manager
   */
  async findWritableHorse(actor: Actor, horseId: string): Promise<HorseEntity> {
    return this.ensureNotDeleted(
      actor,
      await this.horses.findByIdWithDeleted(horseId),
    );
  }

  /**
   * Tìm con ngựa theo id, bỏ qua hồ sơ đã xóa. Dùng để đọc lại hồ sơ sau khi ghi
   *
   * @param id UUID của ngựa
   * @param manager EntityManager dùng để query, mặc định dùng manager ngoài transaction
   * @returns A promise resolving to con ngựa
   * @throws NotFoundException Nếu không có ngựa hoặc hồ sơ đã xóa
   */
  async findHorse(
    id: string,
    manager = this.dataSource.manager,
  ): Promise<HorseEntity> {
    const horse = await this.horses.findById(id, manager);
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  /**
   * Kiểm tra con ngựa có đang thuộc một khu do Head Trainer này phụ trách không (theo horses.barn_id)
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param horseId UUID của ngựa
   * @param trainerId UUID của Head Trainer
   * @returns A promise resolving to true nếu ngựa đang ở một khu có head_trainer_id là trainerId
   */
  isHorseInTrainerBarn(
    manager: EntityManager,
    horseId: string,
    trainerId: string,
  ): Promise<boolean> {
    return this.horses.isHorseInTrainerBarn(manager, horseId, trainerId);
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
   * @returns A promise resolving khi kiểm tra xong
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
    if (!(await this.horses.isHorseInTrainerBarn(manager, horseId, callerId))) {
      throw new ForbiddenException('Ngựa không thuộc khu bạn phụ trách');
    }
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
   * Check whether the actor has any of the given roles
   * @param actor The actor resolved from the JWT
   * @param roles The roles to check
   * @returns True if the actor has at least one of the roles
   */
  hasRole(actor: Actor, ...roles: UserRole[]): boolean {
    return roles.some((role) => actor.roles.includes(role));
  }

  /**
   * Ensure the horse has not been transferred
   * @param horse The horse to check
   * @throws ConflictException if the horse is transferred
   */
  assertNotTransferred(horse: HorseEntity): void {
    if (horse.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
      throw new ConflictException('Ngựa đã chuyển nhượng, hồ sơ chỉ được xem');
    }
  }

  /**
   * Chặn thao tác ghi trên hồ sơ không có hoặc đã xóa mềm, chọn 403 hay 404 theo vai trò người gọi.
   *
   * - Club Manager: hồ sơ đã xóa trả 403 vì Club Manager vẫn xem được hồ sơ đó
   * - Vai trò khác: hồ sơ đã xóa trả 404 như không tồn tại
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horse Con ngựa đã tải kèm hồ sơ đã xóa, hoặc null nếu không có
   * @returns Con ngựa chưa bị xóa
   * @throws NotFoundException Nếu không có ngựa, hoặc hồ sơ đã xóa và người gọi không phải Club Manager
   * @throws ForbiddenException Nếu hồ sơ đã xóa và người gọi là Club Manager
   */
  private ensureNotDeleted(
    actor: Actor,
    horse: HorseEntity | null,
  ): HorseEntity {
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    if (!horse.deletedAt) return horse;
    if (this.hasRole(actor, UserRole.CLUB_MANAGER)) {
      throw new ForbiddenException(DELETED_HORSE_READ_ONLY_MESSAGE);
    }
    throw new NotFoundException('Không tìm thấy ngựa');
  }
}

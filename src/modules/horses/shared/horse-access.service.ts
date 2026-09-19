import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  type CurrentActorUser,
  currentUserForActor,
} from '../../users/utils/current-user';
import { HorseLifecycleStatus } from '../constants/horse-status.enum';
import { HorseEntity } from '../entities/horse.entity';
import type { HorseScope } from '../types/horse.types';
import { findReadableHorse } from '../utils/horse-access';
import { HorsesSharedRepository } from './horses-shared.repository';

/**
 * Các kiểm tra người gọi và con ngựa dùng chung cho mọi feature của module horses.
 */
@Injectable()
export class HorseAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly horses: HorsesSharedRepository,
  ) {}

  /**
   * Lấy user hiện tại từ token của người gọi.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về user hiện tại
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  currentUser(actor: Actor): Promise<CurrentActorUser> {
    return currentUserForActor(this.dataSource.manager, actor);
  }

  /**
   * Tìm con ngựa còn hoạt động (chưa xóa) trong phạm vi của người gọi. Dùng trước các thao tác ghi.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns HorseEntity - Con ngựa tìm thấy
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async findVisible(actor: Actor, horseId: string): Promise<HorseEntity> {
    const caller = await this.currentUser(actor);
    const horse = await this.findHorse(horseId);
    await this.assertVisible(actor, caller.id, horse);
    return horse;
  }

  /**
   * Tìm con ngựa người gọi được xem. Khác findVisible ở chỗ Club Manager xem được cả hồ sơ đã xóa.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns HorseEntity - Con ngựa tìm thấy
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async findReadable(actor: Actor, horseId: string): Promise<HorseEntity> {
    const caller = await this.currentUser(actor);
    return findReadableHorse(
      this.dataSource.manager,
      actor,
      caller.id,
      horseId,
    );
  }

  /**
   * Find a horse by id
   * @param id The ID of the horse
   * @returns A promise resolving to the horse
   * @throws NotFoundException if the horse is not found
   */
  async findHorse(id: string): Promise<HorseEntity> {
    const horse = await this.horses.findById(id);
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  /**
   * Xác định phạm vi ngựa người gọi được xem, dựa vào role. Chỉ Horse Owner bị giới hạn.
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
   * Ensure the horse is not a reference horse
   * @param horse The horse to check
   * @throws BadRequestException if the horse is a reference horse
   */
  assertOperational(horse: HorseEntity): void {
    if (horse.isReference) {
      throw new BadRequestException(
        'Ngựa tham chiếu chỉ dùng cho phả hệ, không áp dụng thao tác này',
      );
    }
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
   * Kiểm tra con ngựa nằm trong phạm vi của người gọi; chỉ Club Manager xem được ngựa tham chiếu.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horse Con ngựa cần kiểm tra
   * @throws NotFoundException Nếu ngựa nằm ngoài phạm vi (báo 'không tìm thấy' để không lộ là ngựa có tồn tại)
   */
  private async assertVisible(
    actor: Actor,
    callerId: string,
    horse: HorseEntity,
  ): Promise<void> {
    if (horse.isReference && !this.hasRole(actor, UserRole.CLUB_MANAGER)) {
      throw new NotFoundException('Không tìm thấy ngựa');
    }
    const visible = await this.horses.isVisible(
      horse.id,
      this.scopeOf(actor, callerId),
    );
    if (!visible) throw new NotFoundException('Không tìm thấy ngựa');
  }
}

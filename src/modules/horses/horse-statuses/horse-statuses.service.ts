import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import {
  HorseResponseDto,
  UpdateHorseHealthDto,
  UpdateHorseLifecycleDto,
} from '../dto/horse.dto';
import { HorseEntity } from '../entities/horse.entity';
import { toHorseResponse } from '../mappers/horse.mapper';
import {
  canTransitionLifecycle,
  lifecycleSideEffects,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnersService } from '../shared/horse-owners.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorseStatusesRepository } from './horse-statuses.repository';

@Injectable()
export class HorseStatusesService {
  constructor(
    private readonly statuses: HorseStatusesRepository,
    private readonly horses: HorsesSharedRepository,
    private readonly access: HorseAccessService,
    private readonly owners: HorseOwnersService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Đổi vòng đời ngựa và dọn dữ liệu liên quan trong cùng một transaction.
   *
   * - Khóa row ngựa trước rồi mới kiểm tra chuyển trạng thái, tránh hai request đổi cùng lúc
   * - RETIRED: hủy giáo án SCHEDULED/ACTIVE và rút đăng ký thi đấu còn mở, giữ ô chuồng và chế độ chăm sóc y tế
   * - TRANSFERRED: như RETIRED, thêm kết thúc sở hữu, groom, xếp chuồng và tự gỡ khóa huấn luyện
   * - ACTIVE: chỉ đổi trạng thái (giải nghệ quay lại, hoặc CLB mua lại ngựa đã chuyển nhượng)
   * - Lưu lý do, thời điểm đổi và ghi nhật ký audit
   * - Gửi đúng trạng thái hiện tại thì trả về hồ sơ, không đổi gì
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Trạng thái vòng đời mới và lý do
   * @returns Promise trả về hồ sơ ngựa sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws BadRequestException Nếu là ngựa tham chiếu
   * @throws ConflictException Nếu không được chuyển giữa hai trạng thái, hoặc ngựa đang có buổi tập/cuộc đua diễn ra
   */
  async updateLifecycle(
    actor: Actor,
    id: string,
    body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      const horse = await this.horses.lockHorse(manager, id);
      if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
      this.access.assertOperational(horse);
      if (horse.lifecycleStatus === body.lifecycleStatus) return;
      if (
        !canTransitionLifecycle(horse.lifecycleStatus, body.lifecycleStatus)
      ) {
        throw new ConflictException(
          `Không thể chuyển vòng đời từ ${horse.lifecycleStatus} sang ${body.lifecycleStatus}`,
        );
      }

      const effects = lifecycleSideEffects(body.lifecycleStatus);
      if (
        (effects.cancelTraining || effects.withdrawRegistrations) &&
        (await this.statuses.hasRunningActivity(manager, id))
      ) {
        throw new ConflictException(
          'Ngựa đang có buổi tập hoặc cuộc đua diễn ra, cần kết thúc trước khi đổi vòng đời',
        );
      }

      const now = new Date();
      const note = this.lifecycleNote(body);
      if (effects.cancelTraining) {
        await this.statuses.cancelOpenTrainingPlans(
          manager,
          id,
          caller.id,
          note,
          now,
        );
      }
      if (effects.withdrawRegistrations) {
        await this.statuses.withdrawOpenRegistrations(manager, id);
      }
      if (effects.closeStallOwnershipGroom) {
        await this.owners.closeActiveOwnerships(manager, id, now);
        await this.statuses.closeActiveGroomAssignment(manager, id, now);
        await this.statuses.closeActiveStallAssignment(manager, id, now);
      }
      if (effects.releaseTrainingLock) {
        await this.statuses.releaseActiveTrainingLock(manager, id, note, now);
      }

      await manager.getRepository(HorseEntity).update(
        { id },
        {
          lifecycleStatus: body.lifecycleStatus,
          lifecycleReason: body.reason,
          lifecycleChangedAt: now,
        },
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE,
        entityId: id,
        before: {
          lifecycleStatus: horse.lifecycleStatus,
          lifecycleReason: horse.lifecycleReason,
        },
        after: {
          lifecycleStatus: body.lifecycleStatus,
          lifecycleReason: body.reason,
        },
      });
    });
    return toHorseResponse(await this.access.findHorse(id));
  }

  /**
   * Change a horse's health status
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @param body The new health status
   * @returns A promise resolving to the updated horse
   * @throws NotFoundException if the horse is not found
   * @throws BadRequestException if the horse is a reference horse
   * @throws ConflictException if the horse is transferred or marked ELIGIBLE while under an active training lock
   */
  async updateHealth(
    actor: Actor,
    id: string,
    body: UpdateHorseHealthDto,
  ): Promise<HorseResponseDto> {
    await this.access.currentUser(actor);
    const horse = await this.access.findHorse(id);
    this.access.assertOperational(horse);
    this.access.assertNotTransferred(horse);
    if (
      body.healthStatus === HorseHealthStatus.ELIGIBLE &&
      (await this.horses.hasActiveTrainingLock(id))
    ) {
      throw new ConflictException(
        'Ngựa đang bị khóa huấn luyện, cần giải khóa trước khi chuyển sang ELIGIBLE',
      );
    }
    await this.dataSource
      .getRepository(HorseEntity)
      .update({ id }, { healthStatus: body.healthStatus });
    return toHorseResponse(await this.access.findHorse(id));
  }

  /**
   * Tạo ghi chú gắn vào giáo án bị hủy và khóa huấn luyện bị tự gỡ, để người xem biết vì sao.
   *
   * @param body Trạng thái vòng đời mới và lý do
   * @returns Ghi chú dạng "Ngựa giải nghệ: <lý do>" hoặc "Ngựa chuyển nhượng: <lý do>"
   */
  private lifecycleNote(body: UpdateHorseLifecycleDto): string {
    const label =
      body.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED
        ? 'chuyển nhượng'
        : 'giải nghệ';
    return `Ngựa ${label}: ${body.reason}`;
  }
}

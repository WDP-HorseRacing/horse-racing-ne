import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { TrainingLockService } from '../../medical/services/training-locks.service';
import { RacingRepository } from '../../racing/repositories/racing.repository';
import { GroomAssignmentsService } from '../../stable/groom-assignments/groom-assignments.service';
import { StallsService } from '../../stable/stalls/stalls.service';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import {
  HorseLifecyclePreviewResponseDto,
  HorseResponseDto,
  LifecyclePreviewQueryDto,
  UpdateHorseHealthDto,
  UpdateHorseLifecycleDto,
} from '../dto';
import {
  HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT,
  TRANSFER_LOCK_RELEASE_CONCLUSION,
} from '../constants/horse.constants';
import { HorseEntity } from '../entities/horse.entity';
import { toHorseResponse } from '../mappers/horse.mapper';
import { toLifecyclePreviewResponse } from '../mappers/horse-statuses.mapper';
import {
  assertLifecycleTransition,
  lifecycleImpactSummary,
  lifecycleSideEffects,
  lifecycleTransitionError,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type { HorseGroomReleasedEvent } from '../types/horse.types';
import { HorseStatusesRepository } from './horse-statuses.repository';

@Injectable()
export class HorseStatusesService {
  constructor(
    private readonly statuses: HorseStatusesRepository,
    private readonly horses: HorsesSharedRepository,
    private readonly access: HorseAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly stalls: StallsService,
    private readonly grooms: GroomAssignmentsService,
    private readonly trainingLocks: TrainingLockService,
    private readonly racing: RacingRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Đổi vòng đời ngựa và xử lý toàn bộ hệ quả trong cùng một transaction (F1.8).
   *
   * - Khóa row ngựa trước rồi mới kiểm tra, tránh hai request đổi cùng lúc
   * - Giải nghệ: hủy giáo án đang mở, rút đăng ký thi đấu chưa diễn ra (racing); giữ khu, ô, groom, y tế
   * - Chuyển nhượng: sau khi commit phát HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT để báo Groom vừa bị kết thúc phân công (BA chốt 2026-09-23); làm phần giải nghệ nếu đang ACTIVE; trả ô, kết thúc groom (stable); tự gỡ lệnh khóa huấn luyện với lý do "Gỡ do chuyển nhượng" (medical); bỏ khu; giữ chủ sở hữu
   * - Kích hoạt lại: sức khỏe về UNDER_OBSERVATION tới khi bác sĩ khám lại; từ chuyển nhượng thì ngựa vào danh sách "Chờ xếp khu", và chủ cũ không còn là HORSE_OWNER đang hoạt động thì bỏ trống chủ (khóa chia sẻ row tài khoản chủ khi kiểm)
   * - Phần ghi bảng của module khác gọi qua hàm export của module đó, dùng chung manager của transaction
   * - Ngựa đang tập hoặc đang đua vẫn đổi được (BA chốt 2026-09-23); giao diện hiện câu tóm tắt từ previewLifecycle để xác nhận trước
   * - Bắt buộc lý do; ghi nhật ký kèm lý do. Gửi đúng trạng thái hiện tại thì không đổi gì
   * - Nhật ký ghi thêm hệ quả thực sự xảy ra (mục III.6.1): số giáo án bị hủy (trainingPlansCancelled), ô đã trả (stallCode), groom đã kết thúc (groomId), trainingLockReleased, raceRegistrationsWithdrawn, chủ bị bỏ trống (ownerId); hệ quả không chạy thì không có key
   * - Hồ sơ đã xóa: Club Manager nhận 403, phải khôi phục trước (qua HorseAccessService.lockWritableHorse)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Trạng thái vòng đời mới và lý do
   * @returns Promise trả về hồ sơ ngựa sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc hồ sơ đã xóa
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu không được chuyển giữa hai trạng thái
   */
  async updateLifecycle(
    actor: Actor,
    id: string,
    body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    const releasedGroomId = await this.dataSource.transaction(
      async (manager) => {
        const caller = await this.access.currentUser(actor, manager);
        const horse = await this.access.lockWritableHorse(manager, actor, id);
        if (horse.lifecycleStatus === body.lifecycleStatus) return null;
        assertLifecycleTransition(horse.lifecycleStatus, body.lifecycleStatus);

        const effects = lifecycleSideEffects(
          horse.lifecycleStatus,
          body.lifecycleStatus,
        );
        const now = new Date();
        const effectBefore: Record<string, unknown> = {};
        const effectAfter: Record<string, unknown> = {};
        if (effects.cancelTraining) {
          effectAfter.trainingPlansCancelled =
            await this.statuses.cancelOpenTrainingPlans(
              manager,
              id,
              caller.id,
              this.lifecycleNote(body),
              now,
            );
        }
        const clearOwner =
          effects.reactivateFromTransfer &&
          horse.ownerId !== null &&
          !(await this.horses.lockActiveHorseOwner(manager, horse.ownerId));
        if (clearOwner) {
          effectBefore.ownerId = horse.ownerId;
          effectAfter.ownerId = null;
        }
        if (effects.withdrawRegistrations) {
          effectAfter.raceRegistrationsWithdrawn =
            await this.racing.withdrawOpenRegistrationsByHorse(manager, id);
        }
        if (effects.releaseStall) {
          const released = await this.stalls.releaseStallByHorse(manager, id);
          if (released) {
            effectBefore.stallCode = released.stallCode;
            effectAfter.stallCode = null;
          }
        }
        let endedGroomId: string | null = null;
        if (effects.endGroom) {
          const groomId = await this.grooms.endGroomByHorse(manager, id);
          endedGroomId = groomId;
          if (groomId) {
            effectBefore.groomId = groomId;
            effectAfter.groomId = null;
          }
        }
        if (effects.releaseTrainingLock) {
          effectAfter.trainingLockReleased =
            await this.trainingLocks.releaseActiveLockByHorse(
              manager,
              id,
              TRANSFER_LOCK_RELEASE_CONCLUSION,
            );
        }

        const changes = {
          lifecycleStatus: body.lifecycleStatus,
          lifecycleReason: body.reason,
          lifecycleChangedAt: now,
          ...(effects.clearBarn ? { barnId: null } : {}),
          ...(effects.resetHealth
            ? { healthStatus: HorseHealthStatus.UNDER_OBSERVATION }
            : {}),
          ...(clearOwner ? { ownerId: null } : {}),
        };
        await manager.getRepository(HorseEntity).update({ id }, changes);
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.HORSE,
          entityId: id,
          before: {
            lifecycleStatus: horse.lifecycleStatus,
            lifecycleReason: horse.lifecycleReason,
            ...(effects.clearBarn ? { barnId: horse.barnId } : {}),
            ...(effects.resetHealth
              ? { healthStatus: horse.healthStatus }
              : {}),
            ...effectBefore,
          },
          after: {
            lifecycleStatus: body.lifecycleStatus,
            lifecycleReason: body.reason,
            ...(effects.clearBarn ? { barnId: null } : {}),
            ...(effects.resetHealth
              ? { healthStatus: HorseHealthStatus.UNDER_OBSERVATION }
              : {}),
            ...effectAfter,
          },
          reason: body.reason,
          feature: 'F1.8',
        });
        return endedGroomId;
      },
    );
    if (releasedGroomId) {
      const event: HorseGroomReleasedEvent = {
        eventId: randomUUID(),
        horseId: id,
        groomId: releasedGroomId,
      };
      this.events.publish(HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT, event);
    }
    return toHorseResponse(await this.access.findHorse(id));
  }

  /**
   * Xem trước hệ quả của việc đổi vòng đời để Club Manager xác nhận trước khi thực hiện (F1.8 mục 5). Không ghi gì.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param query Trạng thái vòng đời muốn chuyển sang
   * @returns A promise resolving to cờ được phép, lý do chặn (nếu có), từng hệ quả sẽ xảy ra và câu tóm tắt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc hồ sơ đã xóa (Club Manager phải khôi phục trước, giống lúc đổi thật)
   * @throws NotFoundException Nếu không có ngựa
   */
  async previewLifecycle(
    actor: Actor,
    id: string,
    query: LifecyclePreviewQueryDto,
  ): Promise<HorseLifecyclePreviewResponseDto> {
    await this.access.currentUser(actor);
    const manager = this.dataSource.manager;
    const horse = await this.access.findWritableHorse(actor, id);
    const to = query.lifecycleStatus;
    const blockedReason =
      horse.lifecycleStatus === to
        ? 'Ngựa đang ở đúng trạng thái này'
        : lifecycleTransitionError(horse.lifecycleStatus, to);
    const effects = lifecycleSideEffects(horse.lifecycleStatus, to);
    const [counts, hasActiveTrainingLock, invalidOwnerName] = await Promise.all(
      [
        this.statuses.lifecycleImpact(id, manager),
        this.horses.hasActiveTrainingLock(id, manager),
        effects.reactivateFromTransfer && horse.ownerId
          ? this.horses.inactiveOwnerName(horse.ownerId, manager)
          : Promise.resolve(null),
      ],
    );
    const impact = { ...counts, hasActiveTrainingLock, invalidOwnerName };
    return toLifecyclePreviewResponse(
      horse,
      to,
      blockedReason,
      effects,
      impact,
      blockedReason === null
        ? lifecycleImpactSummary(horse.name, to, effects, impact)
        : null,
    );
  }

  /**
   * Change a horse's health status
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @param body The new health status
   * @returns A promise resolving to the updated horse
   * @throws NotFoundException if the horse is not found
   * @throws ConflictException if the horse is transferred or marked ELIGIBLE while under an active training lock
   */
  async updateHealth(
    actor: Actor,
    id: string,
    body: UpdateHorseHealthDto,
  ): Promise<HorseResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      await this.access.currentUser(actor, manager);
      const horse = await this.access.lockWritableHorse(manager, actor, id);
      this.access.assertNotTransferred(horse);
      if (
        body.healthStatus === HorseHealthStatus.ELIGIBLE &&
        (await this.horses.hasActiveTrainingLock(id, manager))
      ) {
        throw new ConflictException(
          'Ngựa đang bị khóa huấn luyện, cần giải khóa trước khi chuyển sang ELIGIBLE',
        );
      }
      await manager
        .getRepository(HorseEntity)
        .update({ id }, { healthStatus: body.healthStatus });
    });
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

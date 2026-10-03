import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { MedicalLifecycleService } from '../../medical/shared/medical-lifecycle.service';
import { TrainingLockService } from '../../medical/training-locks/training-locks.service';
import { RaceRegistrationsRepository } from '../../racing/race-registrations/race-registrations.repository';
import { GroomAssignmentsService } from '../../stable/groom-assignments/groom-assignments.service';
import { StallsService } from '../../stable/stalls/stalls.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import {
  HorseLifecyclePreviewResponseDto,
  HorseResponseDto,
  LifecyclePreviewQueryDto,
  UpdateHorseLifecycleDto,
} from '../dto';
import {
  HORSE_AUDIT_FEATURE,
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
import type {
  HorseGroomReleasedEvent,
  LifecycleSideEffects,
} from '../types/horse.types';
import { HorseStatusesRepository } from './horse-statuses.repository';

/**
 * Lý do chặn khi xem trước đổi vòng đời sang đúng trạng thái hiện tại
 */
const LIFECYCLE_ALREADY_IN_STATUS_MESSAGE = 'Ngựa đang ở đúng trạng thái này';

/**
 * Dữ liệu của một lần đổi vòng đời, dùng chung cho các bước trong transaction
 */
interface LifecycleChange {
  id: string;
  horse: HorseEntity;
  body: UpdateHorseLifecycleDto;
  effects: LifecycleSideEffects;
  now: Date;
}

/**
 * Kết quả các hệ quả đã chạy khi đổi vòng đời
 */
interface AppliedLifecycleSideEffects {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  endedGroomId: string | null;
  shouldClearOwner: boolean;
}

/**
 * Giá trị trước và sau của các cột hồ sơ ngựa bị đổi theo hệ quả vòng đời
 */
interface LifecycleFieldChanges {
  before: { barnId?: string | null; healthStatus?: HorseHealthStatus };
  after: { barnId?: null; healthStatus?: HorseHealthStatus };
}

@Injectable()
export class HorseStatusesService {
  constructor(
    private readonly statuses: HorseStatusesRepository,
    private readonly access: HorseAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly stalls: StallsService,
    private readonly grooms: GroomAssignmentsService,
    private readonly trainingLocks: TrainingLockService,
    private readonly medicalLifecycle: MedicalLifecycleService,
    private readonly racing: RaceRegistrationsRepository,
    private readonly events: DomainEventPublisher,
    private readonly training: TrainingOperationsFacade,
  ) {}

  /**
   * Đổi vòng đời ngựa và xử lý toàn bộ hệ quả trong cùng một transaction.
   *
   * - Khóa row ngựa trước khi kiểm tra
   * - Giải nghệ: rút khỏi lớp đang học (training), rút đăng ký thi đấu chưa diễn ra (racing); giữ khu, ô, groom, y tế
   * - Chuyển nhượng: bị chặn 409 nếu ngựa còn bệnh án đang mở; tự bỏ qua yêu cầu khám đang chờ, hủy lịch hẹn khám và lịch chăm sóc chưa làm (medical); sau khi commit phát HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT báo Groom vừa bị kết thúc phân công; rút khỏi lớp đang học (training), đang ACTIVE thì rút thêm đăng ký thi đấu chưa diễn ra (racing); trả ô, kết thúc groom (stable); tự gỡ lệnh khóa huấn luyện với lý do "Gỡ do chuyển nhượng" (medical); bỏ khu; giữ chủ sở hữu
   * - Kích hoạt lại: từ giải nghệ thì giữ nguyên sức khỏe; từ chuyển nhượng thì sức khỏe về UNDER_OBSERVATION tới khi bác sĩ khám lại, ngựa vào danh sách "Chờ xếp khu", và chủ cũ không còn là HORSE_OWNER đang hoạt động thì bỏ trống chủ (khóa chia sẻ row tài khoản chủ khi kiểm)
   * - Phần ghi bảng của module khác gọi qua hàm export của module đó, dùng chung manager của transaction
   * - Ngựa đang tập hoặc đang đua vẫn đổi được
   * - Bắt buộc lý do; ghi nhật ký kèm lý do. Gửi đúng trạng thái hiện tại thì không đổi gì
   * - Nhật ký ghi thêm hệ quả thực sự xảy ra: số lớp bị rút (classesWithdrawn), ô đã trả (stallCode), groom đã kết thúc (groomId), trainingLockReleased, examRequestsDismissed, careSchedulesCancelled, raceRegistrationsWithdrawn, chủ bị bỏ trống (ownerId); hệ quả không chạy thì không có key
   * - Hồ sơ đã xóa: Club Manager nhận 409, phải khôi phục trước (qua HorseAccessService.lockWritableHorse)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Trạng thái vòng đời mới và lý do
   * @returns Promise trả về hồ sơ ngựa sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu Club Manager thao tác hồ sơ đã xóa (phải khôi phục trước), không được chuyển giữa hai trạng thái, hoặc chuyển nhượng ngựa còn bệnh án đang mở
   */
  async updateLifecycle(
    actor: Actor,
    id: string,
    body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    const endedGroomId = await this.dataSource.transaction(
      async (manager) => {
        const caller = await this.access.currentUser(actor, manager);
        const horse = await this.access.lockWritableHorse(manager, actor, id);
        if (horse.lifecycleStatus === body.lifecycleStatus) return null;
        assertLifecycleTransition(horse.lifecycleStatus, body.lifecycleStatus);
        // Lấy các ảnh hưởng của việc truyển status
        const effects = lifecycleSideEffects(
          horse.lifecycleStatus,
          body.lifecycleStatus,
        );
        const now = new Date();
        const applied = await this.applyLifecycleSideEffects(manager, {
          id,
          horse,
          body,
          effects,
          now,
        });
        const fields = this.lifecycleFieldChanges(horse, effects);
        await manager.getRepository(HorseEntity).update(
          { id },
          {
            lifecycleStatus: body.lifecycleStatus,
            lifecycleReason: body.reason,
            lifecycleChangedAt: now,
            ...fields.after,
            ...(applied.shouldClearOwner ? { ownerId: null } : {}),
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
            ...fields.before,
            ...applied.before,
          },
          after: {
            lifecycleStatus: body.lifecycleStatus,
            lifecycleReason: body.reason,
            ...fields.after,
            ...applied.after,
          },
          reason: body.reason,
          feature: HORSE_AUDIT_FEATURE.LIFECYCLE_AND_DELETION,
        });
        return applied.endedGroomId;
      },
    );
    if (endedGroomId) {
      const event: HorseGroomReleasedEvent = {
        eventId: randomUUID(),
        horseId: id,
        groomId: endedGroomId,
      };
      this.events.publish(HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT, event);
    }
    return toHorseResponse(await this.access.findNotDeletedHorse(id));
  }

  /**
   * Xem trước hệ quả của việc đổi vòng đời. Không ghi gì.
   *
   * - Chuyển nhượng ngựa còn bệnh án đang mở trả lý do chặn, giống lúc đổi thật
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param query Trạng thái vòng đời muốn chuyển sang
   * @returns Promise trả về cờ được phép, lý do chặn (nếu có), từng hệ quả sẽ xảy ra và câu tóm tắt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu Club Manager thao tác hồ sơ đã xóa (phải khôi phục trước), giống lúc đổi thật
   */
  async previewLifecycle(
    actor: Actor,
    id: string,
    query: LifecyclePreviewQueryDto,
  ): Promise<HorseLifecyclePreviewResponseDto> {
    await this.access.currentUser(actor);
    const manager = this.dataSource.manager;
    // Tìm ngựa có thể đc chỉnh sửa (chưa xoá)
    const horse = await this.access.findWritableHorse(actor, id);
    const to = query.lifecycleStatus;
    // Lấy các ảnh hưởng của việc chuyển status
    const effects = lifecycleSideEffects(horse.lifecycleStatus, to);
    // Kiểm tra lý do chặn
    const blockedReason = await this.lifecycleBlockedReason(
      manager,
      id,
      horse.lifecycleStatus,
      to,
      effects,
    );
    const [counts, hasActiveTrainingLock, invalidOwnerName, medical] =
      await Promise.all([
        this.statuses.lifecycleImpact(manager, id),
        this.access.hasActiveTrainingLock(id, manager),
        effects.reactivateFromTransfer && horse.ownerId
          ? this.access.invalidOwnerName(horse.ownerId, manager)
          : null,
        // Lấy những yêu cầu khám đang yêu cầu và lịch đã SCEDULE về medical khi change
        effects.settleMedicalWork
          ? this.medicalLifecycle.transferImpact(id, manager)
          : {
              examRequestsToDismiss: 0,
              careSchedulesToCancel: 0,
            },
      ]);
    const impact = {
      ...counts,
      hasActiveTrainingLock,
      invalidOwnerName,
      ...medical,
    };
    return toLifecyclePreviewResponse({
      horse,
      to,
      blockedReason,
      effects,
      impact,
      summary:
        blockedReason === null
          ? lifecycleImpactSummary(horse.name, to, effects, impact)
          : null,
    });
  }

  /**
   * Chạy các hệ quả của việc đổi vòng đời trong transaction đang mở
   *
   * - Thứ tự chạy: xử lý y tế khi chuyển nhượng, rút khỏi lớp đang học, kiểm chủ khi kích hoạt lại từ chuyển nhượng (khóa chia sẻ row tài khoản chủ), rút đăng ký thi đấu chưa diễn ra, trả ô, kết thúc groom, gỡ lệnh khóa huấn luyện
   * - Hệ quả không chạy theo effects thì bỏ qua và không có key trong before/after
   * - Ô hoặc groom không có gì để đóng thì không ghi key tương ứng
   *
   * @param manager EntityManager của transaction đang mở
   * @param change Ngựa đã khóa, trạng thái mới kèm lý do, các hệ quả cần chạy và thời điểm đổi
   * @returns Promise trả về giá trị trước/sau của từng hệ quả đã chạy, groom vừa bị kết thúc (null nếu không có) và cờ bỏ trống chủ
   * @throws ConflictException Nếu chuyển nhượng ngựa còn bệnh án đang mở
   */
  private async applyLifecycleSideEffects(
    manager: EntityManager,
    change: LifecycleChange,
  ): Promise<AppliedLifecycleSideEffects> {
    const { id, horse, body, effects, now } = change;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    // Ghi lại những yêu cầu khám bị bác bỏ (PENDING -> DISSMED) và
    // những lịch trình chăm sóc y tế đã lên lịch mà bị huỷ
    if (effects.settleMedicalWork) {
      Object.assign(
        after,
        await this.medicalLifecycle.settleForTransfer(manager, id),
      );
    }
    // Rút lớp
    if (effects.withdrawFromClasses) {
      const withdrawn = await this.training.withdrawHorseFromClasses(
        manager,
        id,
        { reason: this.lifecycleNote(body), at: now },
      );
      after.classesWithdrawn = withdrawn.classIds.length;
    }
    const shouldClearOwner =
      effects.reactivateFromTransfer &&
      horse.ownerId !== null &&
      !(await this.access.lockActiveHorseOwner(manager, horse.ownerId));
    if (shouldClearOwner) {
      before.ownerId = horse.ownerId;
      after.ownerId = null;
    }
    if (effects.withdrawRegistrations) {
      after.raceRegistrationsWithdrawn =
        await this.racing.withdrawOpenRegistrationsByHorse(manager, id);
    }
    // thả ô 
    if (effects.releaseStall) {
      const released = await this.stalls.closeOpenStallAssignment(manager, id);
      if (released) {
        before.stallCode = released.stallCode;
        after.stallCode = null;
      }
    }
    // kết thúc groom
    let endedGroomId: string | null = null;
    if (effects.endGroom) {
      endedGroomId = await this.grooms.endOpenGroomAssignment(manager, id);
      if (endedGroomId) {
        before.groomId = endedGroomId;
        after.groomId = null;
      }
    }
    // gỡ lệnh khóa huấn luyện 
    if (effects.releaseTrainingLock) {
      after.trainingLockReleased =
        await this.trainingLocks.releaseActiveLockByHorse(
          manager,
          id,
          TRANSFER_LOCK_RELEASE_CONCLUSION,
        );
    }
    return { before, after, endedGroomId, shouldClearOwner };
  }

  /**
   * Tính giá trị trước và sau của khu và sức khỏe khi đổi vòng đời
   *
   * - clearBarn: khu về null
   * - resetHealth: sức khỏe về UNDER_OBSERVATION
   * - Cột nào không đổi thì không có key
   *
   * @param horse Hồ sơ ngựa trước khi đổi
   * @param effects Các hệ quả sẽ chạy (từ lifecycleSideEffects)
   * @returns Giá trị cũ (before) và giá trị mới (after) của các cột bị đổi
   */
  private lifecycleFieldChanges(
    horse: HorseEntity,
    effects: LifecycleSideEffects,
  ): LifecycleFieldChanges {
    return {
      before: {
        ...(effects.clearBarn ? { barnId: horse.barnId } : {}),
        ...(effects.resetHealth ? { healthStatus: horse.healthStatus } : {}),
      },
      after: {
        ...(effects.clearBarn ? { barnId: null } : {}),
        ...(effects.resetHealth
          ? { healthStatus: HorseHealthStatus.UNDER_OBSERVATION }
          : {}),
      },
    };
  }

  /**
   * Tìm lý do không được đổi vòng đời khi xem trước
   *
   * - Kiểm lần lượt: đang ở đúng trạng thái đích, cặp trạng thái không được chuyển, ngựa còn bệnh án đang mở khi chuyển nhượng
   * - Chỉ đọc bệnh án khi hai bước đầu không chặn và effects có settleMedicalWork
   *
   * @param manager EntityManager dùng để query
   * @param id UUID của ngựa
   * @param from Trạng thái vòng đời hiện tại
   * @param to Trạng thái vòng đời muốn chuyển sang
   * @param effects Các hệ quả sẽ chạy (từ lifecycleSideEffects)
   * @returns Promise trả về lý do chặn đầu tiên gặp, null nếu được đổi
   */
  private async lifecycleBlockedReason(
    manager: EntityManager,
    id: string,
    from: HorseLifecycleStatus,
    to: HorseLifecycleStatus,
    effects: LifecycleSideEffects,
  ): Promise<string | null> {
    if (from === to) return LIFECYCLE_ALREADY_IN_STATUS_MESSAGE;
    const transitionError = lifecycleTransitionError(from, to);
    if (transitionError !== null) return transitionError;
    // Nếu không phải chuyển nhượng
    if (!effects.settleMedicalWork) return null;
    return this.medicalLifecycle.transferBlockReason(id, manager);
  }

  /**
   * Tạo ghi chú gắn vào các lượt rút khỏi lớp khi giải nghệ hoặc chuyển nhượng.
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

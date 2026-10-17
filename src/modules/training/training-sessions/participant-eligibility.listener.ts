import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  MEDICAL_HEALTH_CHANGED_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
  MEDICAL_TRAINING_LOCK_SET_EVENT,
} from '../../medical/constants/medical-events.constants';
import type {
  HealthChangedEvent,
  TrainingLockReleasedEvent,
  TrainingLockSetEvent,
} from '../../medical/types/medical-events.types';
import { ELIGIBILITY_REEVALUATED_REASON } from '../constants/participant-window.constants';
import { TrainingOperationsFacade } from '../shared/training-operations.facade';

@Injectable()
export class ParticipantEligibilityListener {
  constructor(
    private readonly dataSource: DataSource,
    private readonly operations: TrainingOperationsFacade,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Nghe event đặt khóa, gỡ khóa huấn luyện và đổi sức khỏe, rồi chấm lại các lượt sắp tới của con ngựa
   *
   * - Chấm theo trạng thái hiện tại trong DB nên nhận lặp hay sai thứ tự event vẫn cho cùng kết quả
   * - Mỗi lượt đổi trạng thái hoặc lý do được ghi một dòng nhật ký, người thao tác null; nhận lặp event không ghi thêm vì không còn gì đổi
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload của event, chỉ dùng horseId
   * @returns Promise hoàn tất khi đã chấm lại xong
   */
  @OnEvent(MEDICAL_TRAINING_LOCK_SET_EVENT, OUTBOX_LISTENER_OPTIONS)
  @OnEvent(MEDICAL_TRAINING_LOCK_RELEASED_EVENT, OUTBOX_LISTENER_OPTIONS)
  @OnEvent(MEDICAL_HEALTH_CHANGED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(
    event:
      TrainingLockSetEvent | TrainingLockReleasedEvent | HealthChangedEvent,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const changes = await this.operations.reevaluateUpcomingParticipants(
        manager,
        event.horseId,
      );
      for (const change of changes) {
        await this.auditService.record(manager, {
          actorId: null,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.SESSION_PARTICIPANT,
          entityId: change.participantId,
          before: { ...change.before },
          after: { ...change.after },
          reason: ELIGIBILITY_REEVALUATED_REASON,
          feature: AuditFeature.TRAIN_RUN,
        });
      }
    });
  }
}

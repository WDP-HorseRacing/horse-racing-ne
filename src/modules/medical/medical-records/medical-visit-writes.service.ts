import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HealthStatusChange } from '../../horses/shared/horse-health.service';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import {
  MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
  MEDICAL_HEALTH_CHANGED_EVENT,
} from '../constants/medical-events.constants';
import {
  DUPLICATE_ALERT_REQUEST_REASON,
  MEDICAL_AUDIT_FEATURE,
} from '../constants/medical.constants';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import {
  ExamRequestWritesService,
  examRequestHandledEvent,
} from '../shared/exam-request-writes.service';
import { MedicalAccessService } from '../shared/medical-access.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';
import type { HealthChangedEvent } from '../types/medical-events.types';

/**
 * Các bước ghi dùng chung giữa ghi, hủy và sửa buổi khám: mở, hủy bệnh án, gắn, trả yêu cầu khám, event đổi sức khỏe. Luôn chạy trong transaction của nơi gọi.
 */
@Injectable()
export class MedicalVisitWritesService {
  constructor(
    private readonly access: MedicalAccessService,
    private readonly lockWrites: TrainingLockWritesService,
    private readonly requestWrites: ExamRequestWritesService,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Mở bệnh án mới, gắn lệnh khóa đang hiệu lực chưa thuộc bệnh án nào
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Ngựa, người mở, ngày mở và chẩn đoán ban đầu
   * @returns Promise trả về bệnh án vừa mở
   */
  async openCase(
    manager: EntityManager,
    input: {
      horseId: string;
      callerId: string;
      openedAt: Date;
      initialDiagnosis: string;
    },
  ): Promise<MedicalCaseEntity> {
    const medicalCase = await manager.save(
      manager.create(MedicalCaseEntity, {
        horseId: input.horseId,
        openedBy: input.callerId,
        openedAt: input.openedAt,
        initialDiagnosis: input.initialDiagnosis,
        status: MedicalCaseStatus.OPEN,
        closedAt: null,
        closedBy: null,
        finalConclusion: null,
      }),
    );
    const attached = await this.lockWrites.attachActiveLockToCase(
      manager,
      input.horseId,
      medicalCase.id,
    );
    await this.audit.record(manager, {
      actorId: input.callerId,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.MEDICAL_CASE,
      entityId: medicalCase.id,
      before: null,
      after: {
        horseId: input.horseId,
        openedAt: input.openedAt,
        initialDiagnosis: input.initialDiagnosis,
        trainingLockAttached: attached > 0,
      },
      feature: MEDICAL_AUDIT_FEATURE.OPEN_CASE,
    });
    return medicalCase;
  }

  /**
   * Chuyển các yêu cầu khám đã gắn sang EXAMINED, mỗi yêu cầu một dòng nhật ký
   *
   * - Yêu cầu có người gửi khác người khám: ghi MEDICAL_EXAM_REQUEST_HANDLED_EVENT để báo người gửi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Bối cảnh buổi khám, gồm các yêu cầu đã khóa
   * @param visitId UUID của buổi khám vừa ghi
   * @returns Promise hoàn tất khi đã cập nhật xong
   */
  async markRequestsExamined(
    manager: EntityManager,
    input: {
      requests: MedicalExamRequestEntity[];
      callerId: string;
      feature: AuditFeature;
    },
    visitId: string,
  ): Promise<void> {
    if (input.requests.length === 0) return;
    await this.requestWrites.markExamined(
      manager,
      input.requests.map((request) => request.id),
      input.callerId,
      visitId,
    );
    for (const request of input.requests) {
      await this.audit.record(manager, {
        actorId: input.callerId,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.MEDICAL_EXAM_REQUEST,
        entityId: request.id,
        before: { status: request.status },
        after: { status: ExamRequestStatus.EXAMINED, medicalRecordId: visitId },
        feature: input.feature,
      });
      const handled = examRequestHandledEvent(
        request,
        ExamRequestStatus.EXAMINED,
        input.callerId,
        null,
      );
      if (handled) {
        await this.events.publish(
          manager,
          MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
          handled,
        );
      }
    }
  }

  /**
   * Trả các yêu cầu khám của buổi khám bị hủy về hàng đợi, mỗi yêu cầu một dòng nhật ký
   *
   * @param manager EntityManager của transaction đang chạy
   * @param recordId UUID buổi khám bị hủy
   * @param callerId UUID bác sĩ hủy
   * @param reason Lý do hủy buổi khám
   * @returns Promise hoàn tất khi đã cập nhật và ghi nhật ký
   */
  async reopenRequests(
    manager: EntityManager,
    recordId: string,
    callerId: string,
    reason: string,
  ): Promise<void> {
    const { reopened, dismissed } =
      await this.requestWrites.reopenForVoidedVisit(
        manager,
        recordId,
        callerId,
        DUPLICATE_ALERT_REQUEST_REASON,
      );
    const rows = [
      ...reopened.map((request) => ({
        request,
        after: { status: ExamRequestStatus.PENDING, medicalRecordId: null },
      })),
      ...dismissed.map((request) => ({
        request,
        after: {
          status: ExamRequestStatus.DISMISSED,
          dismissReason: DUPLICATE_ALERT_REQUEST_REASON,
          medicalRecordId: null,
        },
      })),
    ];
    for (const { request, after } of rows) {
      await this.audit.record(manager, {
        actorId: callerId,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.MEDICAL_EXAM_REQUEST,
        entityId: request.id,
        before: { status: request.status, medicalRecordId: recordId },
        after,
        reason,
        feature: MEDICAL_AUDIT_FEATURE.CASE_VISIT,
      });
    }
  }

  /**
   * Hủy bệnh án mở nhầm khi buổi mở bệnh án bị hủy
   *
   * - Bệnh án chuyển Đã hủy, không có chi phí
   * - Lệnh khóa đang gắn được tách khỏi bệnh án, bản thân lệnh khóa giữ nguyên
   *
   * @param manager EntityManager của transaction đang chạy
   * @param medicalCase Bệnh án đã khóa
   * @param callerId UUID bác sĩ hủy
   * @param reason Lý do hủy buổi khám
   * @returns Promise trả về bệnh án sau khi hủy
   */
  async cancelCase(
    manager: EntityManager,
    medicalCase: MedicalCaseEntity,
    callerId: string,
    reason: string,
  ): Promise<MedicalCaseEntity> {
    await manager.update(
      MedicalCaseEntity,
      { id: medicalCase.id },
      { status: MedicalCaseStatus.CANCELLED },
    );
    const detached = await this.lockWrites.detachLocksFromCase(
      manager,
      medicalCase.id,
    );
    await this.audit.record(manager, {
      actorId: callerId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.MEDICAL_CASE,
      entityId: medicalCase.id,
      before: { status: medicalCase.status },
      after: {
        status: MedicalCaseStatus.CANCELLED,
        trainingLocksDetached: detached,
      },
      reason,
      feature: MEDICAL_AUDIT_FEATURE.CASE_VISIT,
    });
    return { ...medicalCase, status: MedicalCaseStatus.CANCELLED };
  }

  /**
   * Ghi event đổi trạng thái sức khỏe vào outbox khi trạng thái thật sự đổi
   *
   * - Sang Cách ly thì kèm danh sách ngựa có thể đã tiếp xúc (cùng khu, cùng Groom)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horse Ngựa đã khóa trong transaction
   * @param health Kết quả ghi trạng thái sức khỏe, null nếu không ghi
   * @returns Promise hoàn tất khi đã ghi event, hoặc không làm gì nếu trạng thái không đổi
   */
  async publishHealthChanged(
    manager: EntityManager,
    horse: HorseEntity,
    health: HealthStatusChange | null,
  ): Promise<void> {
    if (!health?.changed) return;
    const event: HealthChangedEvent = {
      eventId: randomUUID(),
      horseId: horse.id,
      from: health.from,
      to: health.to,
      ...(health.to === HorseHealthStatus.QUARANTINED && {
        exposedHorses: await this.access.exposedHorses(manager, horse.id),
      }),
      ownerId: horse.ownerId,
    };
    await this.events.publish(manager, MEDICAL_HEALTH_CHANGED_EVENT, event);
  }
}

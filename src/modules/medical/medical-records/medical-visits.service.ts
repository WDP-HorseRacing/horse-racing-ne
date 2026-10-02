import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseMeasurementsService } from '../../horses/horse-measurements/horse-measurements.service';
import {
  HealthStatusChange,
  HorseHealthService,
} from '../../horses/shared/horse-health.service';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import {
  MEDICAL_CASE_CANCELLED_EVENT,
  MEDICAL_CASE_OPENED_EVENT,
  MEDICAL_HEALTH_CHANGED_EVENT,
} from '../constants/medical-events.constants';
import {
  MedicalCaseStatus,
  VisitVoidAction,
} from '../constants/medical-case.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import {
  CreateFollowUpVisitDto,
  CreateStandaloneVisitDto,
  MedicalRecordResponseDto,
  MedicalVisitBaseDto,
  VoidMedicalRecordDto,
} from '../dto';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { toMedicalRecordResponse } from '../mappers/medical.mapper';
import {
  assertCaseOpen,
  assertDistinctInjuries,
  assertHealthChangeReason,
  assertNextVisitAt,
  assertPrescriptionDates,
  assertReplacementTarget,
  assertRequestsAttachable,
  assertStandaloneVisitAllowed,
  assertStandaloneVisitInput,
  assertVisitExamDate,
  resolveVisitVoid,
} from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import type {
  HealthChangedEvent,
  MedicalCaseCancelledEvent,
  MedicalCaseOpenedEvent,
} from '../types/medical-events.types';

/**
 * Bối cảnh ghi một buổi khám, đã qua mọi kiểm tra.
 */
interface VisitWrite {
  horse: HorseEntity;
  callerId: string;
  body: MedicalVisitBaseDto;
  kind: MedicalVisitKind;
  conclusion: MedicalVisitConclusion | null;
  caseId: string | null;
  examDate: Date;
  nextVisitAt: Date | null;
  requests: MedicalExamRequestEntity[];
  nextStatus: HorseHealthStatus;
  healthChanged: boolean;
  feature: string;
}

/**
 * Kết quả ghi một buổi khám, dùng để trả response và phát event sau commit.
 */
interface VisitWriteResult {
  response: MedicalRecordResponseDto;
  alerts: HorseMeasurementAlertEvent[];
  health: HealthStatusChange | null;
  openedCase: MedicalCaseEntity | null;
}

@Injectable()
export class MedicalVisitsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MedicalRecordEntity)
    private readonly medicalRecords: Repository<MedicalRecordEntity>,
    @InjectRepository(MedicalCaseEntity)
    private readonly medicalCases: Repository<MedicalCaseEntity>,
    private readonly access: MedicalAccessService,
    private readonly horseHealth: HorseHealthService,
    private readonly measurements: HorseMeasurementsService,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Ghi buổi khám ngoài bệnh án; kết luận Có vấn đề thì mở bệnh án ngay trong cùng transaction (F3.3, F3.5)
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa trước khi kiểm tra
   * - Ngựa đang có bệnh án mở: 409, phải ghi vào bệnh án đó
   * - Gắn yêu cầu khám đang chờ của chính con ngựa, chuyển chúng sang EXAMINED
   * - Số đo ghi vào F1.5 với nguồn MEDICAL_EXAM; đổi trạng thái sức khỏe bắt buộc lý do
   * - Ngày hẹn khám định kỳ đang hiệu lực chuyển COMPLETED
   * - Mở bệnh án thì lệnh khóa đang hiệu lực chưa gắn bệnh án được gắn vào bệnh án mới
   * - Sau commit: phát cảnh báo chỉ số, event mở bệnh án và đổi trạng thái sức khỏe
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Nội dung buổi khám
   * @returns A promise resolving to buổi khám vừa ghi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu dữ liệu buổi khám không hợp lệ
   * @throws UnprocessableEntityException Nếu có số đo bất thường chưa xác nhận
   * @throws ConflictException Nếu ngựa đã chuyển nhượng, đang có bệnh án mở, hoặc yêu cầu khám không còn chờ
   */
  async createStandaloneVisit(
    actor: Actor,
    horseId: string,
    body: CreateStandaloneVisitDto,
  ): Promise<MedicalRecordResponseDto> {
    const now = new Date();
    const examDate = body.examDate ? new Date(body.examDate) : now;
    const nextVisitAt = body.nextVisitAt ? new Date(body.nextVisitAt) : null;
    const result = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const openCase = await this.access.findOpenCase(horseId, manager);
      assertStandaloneVisitAllowed(openCase !== null);
      assertVisitExamDate(examDate, now);
      assertStandaloneVisitInput({
        kind: body.kind,
        conclusion: body.conclusion,
        initialDiagnosis: body.initialDiagnosis,
        requestCount: body.requestIds?.length ?? 0,
        injuryCount: body.injuries?.length ?? 0,
        hasNextVisit: nextVisitAt !== null,
      });
      if (nextVisitAt) assertNextVisitAt(nextVisitAt, now);
      assertDistinctInjuries(body.injuries ?? []);
      assertPrescriptionDates(body.prescriptions ?? []);
      const nextStatus = body.healthStatus ?? horse.healthStatus;
      const healthChanged = assertHealthChangeReason(
        horse.healthStatus,
        nextStatus,
        body.healthReason,
      );
      const requests = await this.lockAttachableRequests(
        manager,
        horseId,
        body,
      );

      const openedCase =
        body.conclusion === MedicalVisitConclusion.ISSUE
          ? await this.openCase(manager, {
              horseId,
              callerId: caller.id,
              openedAt: examDate,
              initialDiagnosis: body.initialDiagnosis as string,
            })
          : null;
      const written = await this.writeVisit(manager, {
        horse,
        callerId: caller.id,
        body,
        kind: body.kind,
        conclusion: body.conclusion,
        caseId: openedCase?.id ?? null,
        examDate,
        nextVisitAt,
        requests,
        nextStatus,
        healthChanged,
        feature: 'F3.3',
      });
      return { ...written, openedCase };
    });
    this.publishAfterCommit(horseId, result);
    return result.response;
  }

  /**
   * Ghi buổi tái khám vào bệnh án đang mở (F3.6)
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa rồi khóa row bệnh án
   * - Bệnh án đã đóng: 409
   * - Thời điểm khám không sớm hơn ngày mở bệnh án; các luật còn lại như buổi khám ngoài bệnh án
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param caseId UUID của bệnh án
   * @param body Nội dung buổi khám
   * @returns A promise resolving to buổi khám vừa ghi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có bệnh án, hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu dữ liệu buổi khám không hợp lệ
   * @throws UnprocessableEntityException Nếu có số đo bất thường chưa xác nhận
   * @throws ConflictException Nếu bệnh án đã đóng, ngựa đã chuyển nhượng, hoặc yêu cầu khám không còn chờ
   */
  async createFollowUpVisit(
    actor: Actor,
    caseId: string,
    body: CreateFollowUpVisitDto,
  ): Promise<MedicalRecordResponseDto> {
    const now = new Date();
    const examDate = body.examDate ? new Date(body.examDate) : now;
    const nextVisitAt = body.nextVisitAt ? new Date(body.nextVisitAt) : null;
    const horseId = await this.caseHorseId(caseId);
    const result = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const medicalCase = await manager.findOneOrFail(MedicalCaseEntity, {
        where: { id: caseId },
        lock: { mode: 'pessimistic_write' },
      });
      assertCaseOpen(medicalCase.status);
      assertVisitExamDate(examDate, now, medicalCase.openedAt);
      if (nextVisitAt) assertNextVisitAt(nextVisitAt, now);
      assertDistinctInjuries(body.injuries ?? []);
      assertPrescriptionDates(body.prescriptions ?? []);
      const nextStatus = body.healthStatus ?? horse.healthStatus;
      const healthChanged = assertHealthChangeReason(
        horse.healthStatus,
        nextStatus,
        body.healthReason,
      );
      const requests = await this.lockAttachableRequests(
        manager,
        horseId,
        body,
      );
      const written = await this.writeVisit(manager, {
        horse,
        callerId: caller.id,
        body,
        kind: MedicalVisitKind.FOLLOW_UP,
        conclusion: null,
        caseId,
        examDate,
        nextVisitAt,
        requests,
        nextStatus,
        healthChanged,
        feature: 'F3.6',
      });
      return { ...written, openedCase: null };
    });
    this.publishAfterCommit(horseId, result);
    return result.response;
  }

  /**
   * Hủy buổi khám ghi sai (F3.6 mục 8, Flow 3 mục III.2.4)
   *
   * - Chỉ Veterinarian (kiểm ở controller), bắt buộc lý do
   * - Buổi đã hủy: 409. Buổi tái khám hủy được kể cả khi bệnh án đã đóng (không đổi chi phí, kết luận)
   * - Buổi mở bệnh án chỉ hủy được khi bệnh án còn đang điều trị và không còn buổi nào khác chưa hủy; khi đó bệnh án chuyển Đã hủy, lệnh khóa tách khỏi bệnh án, sau commit báo Club Manager và chủ ngựa
   * - Số đo của buổi khám bị xóa mềm khỏi F1.5; trạng thái sức khỏe không tự quay lại
   * - Yêu cầu khám đã gắn giữ nguyên EXAMINED
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param recordId UUID của buổi khám
   * @param body Lý do hủy
   * @returns A promise resolving to buổi khám sau khi hủy
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có buổi khám, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu buổi khám không được hủy, hoặc ngựa đã chuyển nhượng
   */
  async voidVisit(
    actor: Actor,
    recordId: string,
    body: VoidMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    const found = await this.medicalRecords.findOne({
      where: { id: recordId },
    });
    if (!found) throw new NotFoundException('Không tìm thấy buổi khám');
    const result = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        found.horseId,
      );
      const visit = await manager.findOneOrFail(MedicalRecordEntity, {
        where: { id: recordId },
        lock: { mode: 'pessimistic_write' },
      });
      const medicalCase = visit.caseId
        ? await manager.findOneOrFail(MedicalCaseEntity, {
            where: { id: visit.caseId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      const otherActiveVisits = visit.caseId
        ? await manager.count(MedicalRecordEntity, {
            where: {
              caseId: visit.caseId,
              voidedAt: IsNull(),
              id: Not(recordId),
            },
          })
        : 0;
      const action = resolveVisitVoid(
        visit,
        medicalCase?.status ?? null,
        otherActiveVisits,
      );

      const voidedAt = new Date();
      await manager.update(
        MedicalRecordEntity,
        { id: recordId },
        { voidedAt, voidReason: body.reason },
      );
      const measurementsVoided = await this.measurements.voidExamMeasurements(
        manager,
        {
          medicalRecordId: recordId,
          reason: body.reason,
          actorId: caller.id,
          feature: 'F3.6',
        },
      );
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.MEDICAL_RECORD,
        entityId: recordId,
        before: { voidedAt: null },
        after: { voidedAt, measurementsVoided },
        reason: body.reason,
        feature: 'F3.6',
      });
      const cancelledCase =
        action === VisitVoidAction.VOID_AND_CANCEL_CASE && medicalCase
          ? await this.cancelCase(manager, medicalCase, caller.id, body.reason)
          : null;
      const [prescriptions, injuries] = await Promise.all([
        manager.find(PrescriptionEntity, {
          where: { medicalRecordId: recordId },
        }),
        manager.find(InjuryMarkerEntity, {
          where: { medicalRecordId: recordId },
        }),
      ]);
      return {
        cancelledCase,
        response: toMedicalRecordResponse(
          { ...visit, voidedAt, voidReason: body.reason },
          prescriptions,
          injuries,
          true,
        ),
      };
    });
    if (result.cancelledCase) {
      const event: MedicalCaseCancelledEvent = {
        eventId: randomUUID(),
        horseId: result.cancelledCase.horseId,
        caseId: result.cancelledCase.id,
        reason: body.reason,
      };
      this.events.publish(MEDICAL_CASE_CANCELLED_EVENT, event);
    }
    return result.response;
  }

  /**
   * Hủy bệnh án mở nhầm khi buổi mở bệnh án bị hủy (F3.6 mục 8)
   *
   * - Bệnh án chuyển Đã hủy, không có chi phí
   * - Lệnh khóa đang gắn được tách khỏi bệnh án, bản thân lệnh khóa giữ nguyên
   *
   * @param manager EntityManager của transaction đang chạy
   * @param medicalCase Bệnh án đã khóa
   * @param callerId UUID bác sĩ hủy
   * @param reason Lý do hủy buổi khám
   * @returns A promise resolving to bệnh án sau khi hủy
   */
  private async cancelCase(
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
    const detached = await manager.update(
      TrainingLockEntity,
      { caseId: medicalCase.id },
      { caseId: null },
    );
    await this.audit.record(manager, {
      actorId: callerId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.MEDICAL_CASE,
      entityId: medicalCase.id,
      before: { status: medicalCase.status },
      after: {
        status: MedicalCaseStatus.CANCELLED,
        trainingLocksDetached: detached.affected ?? 0,
      },
      reason,
      feature: 'F3.6',
    });
    return { ...medicalCase, status: MedicalCaseStatus.CANCELLED };
  }

  /**
   * Lấy ngựa của bệnh án trước khi mở transaction, để khóa row ngựa trước row bệnh án
   *
   * @param caseId UUID của bệnh án
   * @returns A promise resolving to UUID của ngựa
   * @throws NotFoundException Nếu không có bệnh án
   */
  private async caseHorseId(caseId: string): Promise<string> {
    const medicalCase = await this.medicalCases.findOne({
      where: { id: caseId },
      select: { id: true, horseId: true },
    });
    if (!medicalCase) throw new NotFoundException('Không tìm thấy bệnh án');
    return medicalCase.horseId;
  }

  /**
   * Khóa và kiểm các yêu cầu khám được gắn, cùng buổi khám bị thay (nếu có)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa đang khám
   * @param body Nội dung buổi khám
   * @returns A promise resolving to các yêu cầu khám đã khóa
   * @throws ConflictException Nếu có yêu cầu không còn chờ, khác ngựa, hoặc buổi bị thay không hợp lệ
   */
  private async lockAttachableRequests(
    manager: EntityManager,
    horseId: string,
    body: MedicalVisitBaseDto,
  ): Promise<MedicalExamRequestEntity[]> {
    if (body.replacesRecordId) {
      const replaced = await manager.findOne(MedicalRecordEntity, {
        where: { id: body.replacesRecordId },
      });
      assertReplacementTarget(replaced, horseId);
    }
    const requestIds = body.requestIds ?? [];
    if (requestIds.length === 0) return [];
    const requests = await manager.find(MedicalExamRequestEntity, {
      where: { id: In(requestIds) },
      lock: { mode: 'pessimistic_write' },
    });
    assertRequestsAttachable(requestIds, requests, horseId);
    return requests;
  }

  /**
   * Mở bệnh án mới, gắn lệnh khóa đang hiệu lực chưa thuộc bệnh án nào (F3.5 mục 5)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Ngựa, người mở, ngày mở và chẩn đoán ban đầu
   * @returns A promise resolving to bệnh án vừa mở
   */
  private async openCase(
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
        totalCost: null,
      }),
    );
    const attached = await manager.update(
      TrainingLockEntity,
      {
        horseId: input.horseId,
        status: TrainingLockStatus.ACTIVE,
        caseId: IsNull(),
      },
      { caseId: medicalCase.id },
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
        trainingLockAttached: (attached.affected ?? 0) > 0,
      },
      feature: 'F3.5',
    });
    return medicalCase;
  }

  /**
   * Ghi buổi khám cùng mọi hệ quả trong transaction: đơn thuốc, chấn thương, số đo, yêu cầu khám, trạng thái sức khỏe, ngày hẹn khám định kỳ, nhật ký
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Bối cảnh buổi khám đã qua kiểm tra
   * @returns A promise resolving to response của buổi khám, cảnh báo chỉ số và thay đổi trạng thái sức khỏe
   * @throws BadRequestException Nếu số đo không hợp lệ
   * @throws UnprocessableEntityException Nếu có số đo bất thường chưa xác nhận
   */
  private async writeVisit(
    manager: EntityManager,
    input: VisitWrite,
  ): Promise<Omit<VisitWriteResult, 'openedCase'>> {
    const { horse, body, nextStatus } = input;

    const visit = await manager.save(
      manager.create(MedicalRecordEntity, {
        horseId: horse.id,
        vetId: input.callerId,
        examDate: input.examDate,
        diagnosis: body.diagnosis || null,
        severity: null,
        resultingStatus: nextStatus,
        caseId: input.caseId,
        kind: input.kind,
        conclusion: input.conclusion,
        nextVisitAt: input.nextVisitAt,
        careInstructions: body.careInstructions || null,
        voidedAt: null,
        voidReason: null,
        replacesRecordId: body.replacesRecordId ?? null,
      }),
    );
    const prescriptions = await manager.save(
      (body.prescriptions ?? []).map((item) =>
        manager.create(PrescriptionEntity, {
          medicalRecordId: visit.id,
          medicine: item.medicine,
          dosage: item.dosage,
          frequency: item.frequency,
          startDate: item.startDate,
          endDate: item.endDate ?? null,
        }),
      ),
    );
    const injuries = await manager.save(
      (body.injuries ?? []).map((item) =>
        manager.create(InjuryMarkerEntity, {
          medicalRecordId: visit.id,
          bodyRegion: item.bodyRegion,
          position: item.position ?? null,
          injuryType: item.injuryType,
          recoveryStatus: item.recoveryStatus,
          notes: item.notes ?? null,
        }),
      ),
    );
    const alerts = await this.measurements.recordExamMeasurements(manager, {
      horseId: horse.id,
      medicalRecordId: visit.id,
      measuredBy: input.callerId,
      measuredAt: input.examDate,
      values: body.measurements ?? [],
      confirmAbnormal: body.confirmAbnormal === true,
      feature: input.feature,
    });
    await this.markRequestsExamined(manager, input, visit.id);
    const health = input.healthChanged
      ? await this.horseHealth.applyHealthStatus(manager, {
          horseId: horse.id,
          to: nextStatus,
          actorId: input.callerId,
          reason: body.healthReason as string,
          feature: input.feature,
        })
      : null;
    const appointment = await manager.update(
      CareScheduleEntity,
      {
        horseId: horse.id,
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.SCHEDULED,
      },
      {
        status: CareScheduleStatus.COMPLETED,
        completedAt: new Date(),
        completedBy: input.callerId,
      },
    );
    await this.audit.record(manager, {
      actorId: input.callerId,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.MEDICAL_RECORD,
      entityId: visit.id,
      before: null,
      after: {
        horseId: horse.id,
        kind: input.kind,
        conclusion: input.conclusion,
        caseId: input.caseId,
        examDate: input.examDate,
        resultingStatus: nextStatus,
        requestIds: input.requests.map((request) => request.id),
        prescriptionCount: prescriptions.length,
        injuryCount: injuries.length,
        appointmentCompleted: (appointment.affected ?? 0) > 0,
        ...(visit.replacesRecordId
          ? { replacesRecordId: visit.replacesRecordId }
          : {}),
      },
      feature: input.feature,
    });
    return {
      response: toMedicalRecordResponse(visit, prescriptions, injuries, true),
      alerts,
      health,
    };
  }

  /**
   * Chuyển các yêu cầu khám đã gắn sang EXAMINED, mỗi yêu cầu một dòng nhật ký (F3.4 mục 7, 10)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Bối cảnh buổi khám, gồm các yêu cầu đã khóa
   * @param visitId UUID của buổi khám vừa ghi
   * @returns A promise resolving khi đã cập nhật xong
   */
  private async markRequestsExamined(
    manager: EntityManager,
    input: VisitWrite,
    visitId: string,
  ): Promise<void> {
    if (input.requests.length === 0) return;
    const handledAt = new Date();
    await manager.update(
      MedicalExamRequestEntity,
      { id: In(input.requests.map((request) => request.id)) },
      {
        status: ExamRequestStatus.EXAMINED,
        handledBy: input.callerId,
        handledAt,
        medicalRecordId: visitId,
      },
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
    }
  }

  /**
   * Phát cảnh báo chỉ số và các event y tế sau khi transaction đã commit
   *
   * @param horseId UUID của ngựa
   * @param result Kết quả ghi buổi khám
   */
  private publishAfterCommit(horseId: string, result: VisitWriteResult): void {
    this.measurements.publishAlerts(result.alerts);
    if (result.openedCase) {
      const event: MedicalCaseOpenedEvent = {
        eventId: randomUUID(),
        horseId,
        caseId: result.openedCase.id,
        initialDiagnosis: result.openedCase.initialDiagnosis,
      };
      this.events.publish(MEDICAL_CASE_OPENED_EVENT, event);
    }
    if (result.health?.changed) {
      const event: HealthChangedEvent = {
        eventId: randomUUID(),
        horseId,
        from: result.health.from,
        to: result.health.to,
      };
      this.events.publish(MEDICAL_HEALTH_CHANGED_EVENT, event);
    }
  }
}

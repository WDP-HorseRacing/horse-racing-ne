import { AuditFeature } from '../../audit/constants/audit-feature.enum';
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
import { HorseOwnershipService } from '../../horses/shared/horse-ownership.service';
import { ownershipAt } from '../../horses/policies/horse-ownership.policy';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import {
  MEDICAL_CASE_CANCELLED_EVENT,
  MEDICAL_CASE_OPENED_EVENT,
  MEDICAL_VISIT_COST_ADJUSTED_EVENT,
} from '../constants/medical-events.constants';
import { VisitVoidAction } from '../constants/medical-case.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
  VisitVoidHealthOutcome,
} from '../constants/medical-visit.enum';
import {
  AdjustVisitCostDto,
  CreateFollowUpVisitDto,
  CreateStandaloneVisitDto,
  MedicalRecordResponseDto,
  MedicalVisitBaseDto,
  VoidMedicalRecordDto,
  VoidMedicalRecordResponseDto,
} from '../dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { InjuryEntity } from '../entities/injury.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import {
  costOfVisit,
  toMedicalRecordResponse,
  toVoidMedicalRecordResponse,
} from '../mappers/medical.mapper';
import {
  assertCaseOpen,
  assertHealthChangeReason,
  assertInjuryUpdates,
  assertNextVisitAt,
  assertPrescriptionDates,
  assertReplacementTarget,
  assertRequestsAttachable,
  assertStandaloneVisitAllowed,
  assertStandaloneVisitInput,
  assertVisitCostAdjustable,
  assertVisitAuthor,
  resolveVisitVoid,
  resolveVoidHealth,
} from '../policies/medical.policy';
import { CareScheduleWritesService } from '../shared/care-schedule-writes.service';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalVisitWritesService } from './medical-visit-writes.service';
import type {
  MedicalCaseCancelledEvent,
  MedicalCaseOpenedEvent,
  MedicalVisitCostAdjustedEvent,
} from '../types/medical-events.types';
import {
  DUPLICATE_ALERT_REQUEST_REASON,
  MEDICAL_AUDIT_FEATURE,
  VISIT_COST_AUTHOR_ONLY_MESSAGE,
  VISIT_VOID_AUTHOR_ONLY_MESSAGE,
} from '../constants/medical.constants';

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
  feature: AuditFeature;
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
    private readonly scheduleWrites: CareScheduleWritesService,
    private readonly visitWrites: MedicalVisitWritesService,
    private readonly horseHealth: HorseHealthService,
    private readonly measurements: HorseMeasurementsService,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
    private readonly ownerships: HorseOwnershipService,
  ) {}

  /**
   * Ghi buổi khám ngoài bệnh án; kết luận Có vấn đề thì mở bệnh án ngay trong cùng transaction
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa trước khi kiểm tra
   * - Thời điểm khám là thời điểm ghi
   * - Ngựa đang có bệnh án mở: 409, phải ghi vào bệnh án đó
   * - Gắn yêu cầu khám đang chờ của chính con ngựa, chuyển chúng sang EXAMINED
   * - Số đo ghi vào lịch sử số đo cơ thể với nguồn MEDICAL_EXAM; đổi trạng thái sức khỏe bắt buộc lý do
   * - Chấn thương: ghi mới, hoặc cập nhật mức hồi phục của chấn thương chưa lành của chính con ngựa (trùng hay không thuộc ngựa: 400, đã lành: 409); chấn thương không có trong buổi khám giữ nguyên mức cũ
   * - Ngày hẹn khám định kỳ đang hiệu lực chuyển COMPLETED
   * - Mở bệnh án thì lệnh khóa đang hiệu lực chưa gắn bệnh án được gắn vào bệnh án mới
   * - Cảnh báo chỉ số, event mở bệnh án và đổi trạng thái sức khỏe ghi vào outbox trong cùng transaction
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Nội dung buổi khám
   * @returns Promise trả về buổi khám vừa ghi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu dữ liệu buổi khám không hợp lệ
   * @throws UnprocessableEntityException Nếu có số đo bất thường chưa xác nhận
   * @throws ConflictException Nếu ngựa đã chuyển nhượng, đang có bệnh án mở, yêu cầu khám không còn chờ, hoặc cập nhật chấn thương đã lành
   */
  async createStandaloneVisit(
    actor: Actor,
    horseId: string,
    body: CreateStandaloneVisitDto,
  ): Promise<MedicalRecordResponseDto> {
    const now = new Date();
    const nextVisitAt = body.nextVisitAt ? new Date(body.nextVisitAt) : null;
    const result = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const openCase = await this.access.findOpenCase(horseId, manager);
      assertStandaloneVisitAllowed(openCase !== null);
      assertStandaloneVisitInput({
        kind: body.kind,
        conclusion: body.conclusion,
        initialDiagnosis: body.initialDiagnosis,
        requestCount: body.requestIds?.length ?? 0,
        injuryCount:
          (body.injuryUpdates?.length ?? 0) + (body.newInjuries?.length ?? 0),
        hasNextVisit: nextVisitAt !== null,
        hasOpenEndedPrescription: (body.prescriptions ?? []).some(
          (item) => !item.endDate,
        ),
      });
      if (nextVisitAt) assertNextVisitAt(nextVisitAt, now);
      await this.checkInjuryUpdates(manager, horseId, body);
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
          ? await this.visitWrites.openCase(manager, {
              horseId,
              callerId: caller.id,
              openedAt: now,
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
        examDate: now,
        nextVisitAt,
        requests,
        nextStatus,
        healthChanged,
        feature: MEDICAL_AUDIT_FEATURE.STANDALONE_VISIT,
      });
      const visitResult = { ...written, openedCase };
      await this.publishVisitEvents(manager, horse, visitResult);
      return visitResult;
    });
    return result.response;
  }

  /**
   * Ghi buổi tái khám vào bệnh án đang mở
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa rồi khóa row bệnh án
   * - Bệnh án đã đóng: 409
   * - Thời điểm khám là thời điểm ghi; các luật còn lại như buổi khám ngoài bệnh án
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param caseId UUID của bệnh án
   * @param body Nội dung buổi khám
   * @returns Promise trả về buổi khám vừa ghi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có bệnh án, hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu dữ liệu buổi khám không hợp lệ
   * @throws UnprocessableEntityException Nếu có số đo bất thường chưa xác nhận
   * @throws ConflictException Nếu bệnh án đã đóng, ngựa đã chuyển nhượng, yêu cầu khám không còn chờ, hoặc cập nhật chấn thương đã lành
   */
  async createFollowUpVisit(
    actor: Actor,
    caseId: string,
    body: CreateFollowUpVisitDto,
  ): Promise<MedicalRecordResponseDto> {
    const now = new Date();
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
      if (nextVisitAt) assertNextVisitAt(nextVisitAt, now);
      await this.checkInjuryUpdates(manager, horseId, body);
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
        examDate: now,
        nextVisitAt,
        requests,
        nextStatus,
        healthChanged,
        feature: MEDICAL_AUDIT_FEATURE.CASE_VISIT,
      });
      const visitResult = { ...written, openedCase: null };
      await this.publishVisitEvents(manager, horse, visitResult);
      return visitResult;
    });
    return result.response;
  }

  /**
   * Hủy buổi khám ghi sai
   *
   * - Chỉ Veterinarian (kiểm ở controller), bắt buộc lý do
   * - Chỉ bác sĩ ghi buổi khám mới được hủy; bác sĩ khác: 403
   * - Buổi đã hủy: 409. Buổi tái khám hủy được kể cả khi bệnh án đã đóng (không đổi chi phí, kết luận)
   * - Buổi mở bệnh án chỉ hủy được khi bệnh án còn đang điều trị và không còn buổi nào khác chưa hủy; khi đó bệnh án chuyển Đã hủy, lệnh khóa tách khỏi bệnh án, event hủy bệnh án ghi vào outbox trong cùng transaction (báo Club Manager và chủ ngựa)
   * - Số đo của buổi khám bị xóa mềm khỏi lịch sử số đo cơ thể
   * - Yêu cầu khám mà buổi khám đã đánh dấu EXAMINED về lại PENDING và bỏ gắn buổi khám, mỗi yêu cầu một dòng nhật ký; yêu cầu tự sinh trùng loại cảnh báo với yêu cầu đang chờ thì chuyển DISMISSED
   * - Buổi khám đã đổi sức khỏe và chưa có lần đổi sức khỏe nào sau đó: sức khỏe ngựa về giá trị trước buổi khám (nhật ký lý do "Hủy buổi khám: <lý do>", event đổi sức khỏe ghi vào outbox); có lần đổi sau đó hoặc buổi khám cũ không lưu sức khỏe trước khám thì giữ nguyên
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param recordId UUID của buổi khám
   * @param body Lý do hủy
   * @returns Promise trả về buổi khám sau khi hủy kèm cách xử lý trạng thái sức khỏe
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc người gọi không phải bác sĩ ghi buổi khám
   * @throws NotFoundException Nếu không có buổi khám, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu buổi khám không được hủy, hoặc ngựa đã chuyển nhượng
   */
  async voidVisit(
    actor: Actor,
    recordId: string,
    body: VoidMedicalRecordDto,
  ): Promise<VoidMedicalRecordResponseDto> {
    const found = await this.medicalRecords.findOne({
      where: { id: recordId },
    });
    if (!found) throw new NotFoundException('Không tìm thấy buổi khám');
    return this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
        manager,
        actor,
        found.horseId,
      );
      const visit = await manager.findOneOrFail(MedicalRecordEntity, {
        where: { id: recordId },
        lock: { mode: 'pessimistic_write' },
      });
      assertVisitAuthor(visit.vetId, caller.id, VISIT_VOID_AUTHOR_ONLY_MESSAGE);
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
          feature: MEDICAL_AUDIT_FEATURE.CASE_VISIT,
        },
      );
      await this.visitWrites.reopenRequests(manager, {
        recordId,
        callerId: caller.id,
        reason: body.reason,
        duplicateReason: DUPLICATE_ALERT_REQUEST_REASON,
        feature: MEDICAL_AUDIT_FEATURE.CASE_VISIT,
      });
      const laterChange =
        visit.healthBefore !== null &&
        visit.healthBefore !== visit.resultingStatus
          ? await this.access.latestHealthChangeAfterVisit(
              manager,
              horse.id,
              recordId,
            )
          : null;
      const healthOutcome = resolveVoidHealth({
        healthBefore: visit.healthBefore,
        resultingStatus: visit.resultingStatus,
        currentStatus: horse.healthStatus,
        hasLaterChange: laterChange !== null,
      });
      const health =
        healthOutcome === VisitVoidHealthOutcome.REVERTED
          ? await this.horseHealth.applyHealthStatus(manager, {
              horseId: horse.id,
              to: visit.healthBefore as HorseHealthStatus,
              actorId: caller.id,
              reason: `Hủy buổi khám: ${body.reason}`,
              feature: MEDICAL_AUDIT_FEATURE.CASE_VISIT,
            })
          : null;
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.MEDICAL_RECORD,
        entityId: recordId,
        before: { voidedAt: null },
        after: { voidedAt, measurementsVoided, healthOutcome },
        reason: body.reason,
        feature: MEDICAL_AUDIT_FEATURE.CASE_VISIT,
      });
      const cancelledCase =
        action === VisitVoidAction.VOID_AND_CANCEL_CASE && medicalCase
          ? await this.visitWrites.cancelCase(
              manager,
              medicalCase,
              caller.id,
              body.reason,
            )
          : null;
      if (cancelledCase) {
        const event: MedicalCaseCancelledEvent = {
          eventId: randomUUID(),
          horseId: cancelledCase.horseId,
          caseId: cancelledCase.id,
          reason: body.reason,
          ownerId: horse.ownerId,
        };
        await this.events.publish(manager, MEDICAL_CASE_CANCELLED_EVENT, event);
      }
      await this.visitWrites.publishHealthChanged(manager, horse, health);
      const [prescriptions, injuries] = await Promise.all([
        manager.find(PrescriptionEntity, {
          where: { medicalRecordId: recordId },
        }),
        manager.find(InjuryMarkerEntity, {
          where: { medicalRecordId: recordId },
          relations: { injury: true },
        }),
      ]);
      return toVoidMedicalRecordResponse(
        toMedicalRecordResponse(
          { ...visit, voidedAt, voidReason: body.reason },
          prescriptions,
          injuries,
          true,
          true,
          false,
        ),
        healthOutcome,
        laterChange,
      );
    });
  }

  /**
   * Điều chỉnh chi phí của một buổi khám, bắt buộc lý do
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa rồi row buổi khám; không giới hạn thời gian, bệnh án đóng hay mở đều được
   * - Chỉ bác sĩ ghi buổi khám mới được điều chỉnh; bác sĩ khác: 403, kiểm trước luật buổi đã hủy
   * - Ngựa đã chuyển nhượng hoặc đã mất vẫn sửa được chi phí
   * - Số mới trùng số cũ thì không ghi gì và không báo
   * - Ghi nhật ký giá trị trước, sau và lý do; event báo lại Club Manager và chủ của giai đoạn sở hữu chứa ngày khám, ghi vào outbox trong cùng transaction
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param recordId UUID của buổi khám
   * @param body Chi phí mới và lý do
   * @returns Promise trả về buổi khám sau khi điều chỉnh
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc người gọi không phải bác sĩ ghi buổi khám
   * @throws NotFoundException Nếu không có buổi khám, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu buổi khám đã hủy, hoặc Club Manager thao tác hồ sơ ngựa đã xóa
   */
  async adjustVisitCost(
    actor: Actor,
    recordId: string,
    body: AdjustVisitCostDto,
  ): Promise<MedicalRecordResponseDto> {
    const found = await this.medicalRecords.findOne({
      where: { id: recordId },
    });
    if (!found) throw new NotFoundException('Không tìm thấy buổi khám');
    return this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForCostAdjustment(
        manager,
        actor,
        found.horseId,
      );
      const visit = await manager.findOneOrFail(MedicalRecordEntity, {
        where: { id: recordId },
        lock: { mode: 'pessimistic_write' },
      });
      assertVisitAuthor(visit.vetId, caller.id, VISIT_COST_AUTHOR_ONLY_MESSAGE);
      assertVisitCostAdjustable(visit.voidedAt);
      const previous = costOfVisit(visit);
      const cost = String(body.cost);
      if (previous !== body.cost) {
        await manager.update(MedicalRecordEntity, { id: recordId }, { cost });
        await this.audit.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.MEDICAL_RECORD,
          entityId: recordId,
          before: { cost: previous },
          after: { cost: body.cost },
          reason: body.reason,
          feature:
            visit.kind === MedicalVisitKind.FOLLOW_UP
              ? MEDICAL_AUDIT_FEATURE.CASE_VISIT
              : MEDICAL_AUDIT_FEATURE.STANDALONE_VISIT,
        });
        const costOwner = ownershipAt(
          await this.ownerships.periodsOfHorse(manager, visit.horseId),
          visit.examDate,
        );
        const event: MedicalVisitCostAdjustedEvent = {
          eventId: randomUUID(),
          horseId: visit.horseId,
          recordId,
          caseId: visit.caseId,
          examDate: visit.examDate.toISOString(),
          fromCost: previous,
          toCost: body.cost,
          costOwnerId: costOwner?.ownerId ?? null,
        };
        await this.events.publish(
          manager,
          MEDICAL_VISIT_COST_ADJUSTED_EVENT,
          event,
        );
      }
      const [prescriptions, injuries] = await Promise.all([
        manager.find(PrescriptionEntity, {
          where: { medicalRecordId: recordId },
        }),
        manager.find(InjuryMarkerEntity, {
          where: { medicalRecordId: recordId },
          relations: { injury: true },
        }),
      ]);
      return toMedicalRecordResponse(
        { ...visit, cost },
        prescriptions,
        injuries,
        true,
        true,
        false,
      );
    });
  }

  /**
   * Lấy ngựa của bệnh án trước khi mở transaction
   *
   * @param caseId UUID của bệnh án
   * @returns Promise trả về UUID của ngựa
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
   * Kiểm tra các chấn thương cần cập nhật mức hồi phục trong buổi khám
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa đã khóa
   * @param body Nội dung buổi khám
   * @returns Promise hoàn tất khi danh sách cập nhật hợp lệ
   * @throws BadRequestException Nếu trùng chấn thương, hoặc chấn thương không thuộc con ngựa
   * @throws ConflictException Nếu có chấn thương đã lành
   */
  private async checkInjuryUpdates(
    manager: EntityManager,
    horseId: string,
    body: MedicalVisitBaseDto,
  ): Promise<void> {
    const updates = body.injuryUpdates ?? [];
    if (updates.length === 0) return;
    assertInjuryUpdates(
      updates.map((item) => item.injuryId),
      await this.access.currentInjuryStatuses(manager, horseId),
    );
  }

  /**
   * Khóa và kiểm các yêu cầu khám được gắn, cùng buổi khám bị thay (nếu có)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa đang khám
   * @param body Nội dung buổi khám
   * @returns Promise trả về các yêu cầu khám đã khóa
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
   * Ghi buổi khám cùng mọi hệ quả trong transaction: đơn thuốc, chấn thương, số đo, yêu cầu khám, trạng thái sức khỏe, ngày hẹn khám định kỳ, nhật ký
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Bối cảnh buổi khám đã qua kiểm tra
   * @returns Promise trả về response của buổi khám, cảnh báo chỉ số và thay đổi trạng thái sức khỏe
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
        barnId: horse.barnId,
        vetId: input.callerId,
        examDate: input.examDate,
        diagnosis: body.diagnosis || null,
        severity: null,
        healthBefore: horse.healthStatus,
        resultingStatus: nextStatus,
        caseId: input.caseId,
        kind: input.kind,
        conclusion: input.conclusion,
        nextVisitAt: input.nextVisitAt,
        careInstructions: body.careInstructions || null,
        voidedAt: null,
        voidReason: null,
        cost: String(body.cost ?? 0),
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
    const updates = body.injuryUpdates ?? [];
    const newInjuries = body.newInjuries ?? [];
    const updated = updates.length
      ? await manager.findBy(InjuryEntity, {
          id: In(updates.map((item) => item.injuryId)),
        })
      : [];
    const discovered = await manager.save(
      newInjuries.map((item) =>
        manager.create(InjuryEntity, {
          horseId: horse.id,
          bodyRegion: item.bodyRegion,
          injuryType: item.injuryType,
          position: item.position,
          firstMedicalRecordId: visit.id,
        }),
      ),
    );
    const injuryOf = new Map(
      [...updated, ...discovered].map((injury) => [injury.id, injury]),
    );
    const observations = [
      ...updates,
      ...newInjuries.map((item, index) => ({
        ...item,
        injuryId: discovered[index].id,
      })),
    ];
    const injuries = await manager.save(
      observations.map((item) =>
        manager.create(InjuryMarkerEntity, {
          medicalRecordId: visit.id,
          injuryId: item.injuryId,
          injury: injuryOf.get(item.injuryId),
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
    await this.visitWrites.markRequestsExamined(manager, input, visit.id);
    const health = input.healthChanged
      ? await this.horseHealth.applyHealthStatus(manager, {
          horseId: horse.id,
          to: nextStatus,
          actorId: input.callerId,
          reason: body.healthReason as string,
          feature: input.feature,
        })
      : null;
    const appointmentsCompleted =
      await this.scheduleWrites.completeRoutineCheckup(
        manager,
        horse.id,
        input.callerId,
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
        cost: body.cost ?? 0,
        requestIds: input.requests.map((request) => request.id),
        prescriptionCount: prescriptions.length,
        injuryCount: injuries.length,
        appointmentCompleted: appointmentsCompleted > 0,
        ...(visit.replacesRecordId
          ? { replacesRecordId: visit.replacesRecordId }
          : {}),
      },
      feature: input.feature,
    });
    return {
      response: toMedicalRecordResponse(
        visit,
        prescriptions,
        injuries,
        true,
        true,
        false,
      ),
      alerts,
      health,
    };
  }

  /**
   * Ghi cảnh báo chỉ số và các event y tế của buổi khám vào outbox trong cùng transaction
   *
   * - Ghi các cảnh báo chỉ số của buổi khám
   * - Có mở bệnh án: ghi event mở bệnh án
   * - Trạng thái sức khỏe đổi: ghi event đổi trạng thái sức khỏe; sang Cách ly thì kèm danh sách ngựa có thể đã tiếp xúc (cùng khu, cùng Groom)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horse Ngựa đã khóa trong transaction
   * @param result Kết quả ghi buổi khám
   * @returns Promise hoàn tất khi đã ghi xong các event vào outbox
   */
  private async publishVisitEvents(
    manager: EntityManager,
    horse: HorseEntity,
    result: VisitWriteResult,
  ): Promise<void> {
    const horseId = horse.id;
    await this.measurements.publishAlerts(manager, result.alerts);
    if (result.openedCase) {
      const event: MedicalCaseOpenedEvent = {
        eventId: randomUUID(),
        horseId,
        caseId: result.openedCase.id,
        initialDiagnosis: result.openedCase.initialDiagnosis,
        ownerId: horse.ownerId,
      };
      await this.events.publish(manager, MEDICAL_CASE_OPENED_EVENT, event);
    }
    await this.visitWrites.publishHealthChanged(manager, horse, result.health);
  }
}

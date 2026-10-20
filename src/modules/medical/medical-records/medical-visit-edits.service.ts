import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  MoreThan,
  Not,
  Repository,
} from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseMeasurementsService } from '../../horses/horse-measurements/horse-measurements.service';
import { HorseHealthService } from '../../horses/shared/horse-health.service';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { RecoveryStatus } from '../constants/injury-marker.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import {
  MEDICAL_CASE_CANCELLED_EVENT,
  MEDICAL_CASE_OPENED_EVENT,
} from '../constants/medical-events.constants';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
  VisitEditHealthOutcome,
} from '../constants/medical-visit.enum';
import {
  DETACHED_ALERT_REQUEST_REASON,
  MEDICAL_AUDIT_FEATURE,
  VISIT_EDIT_AUTHOR_ONLY_MESSAGE,
} from '../constants/medical.constants';
import { EditMedicalRecordResponseDto, UpdateMedicalVisitDto } from '../dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { InjuryEntity } from '../entities/injury.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { toMedicalRecordResponse } from '../mappers/medical.mapper';
import { toEditMedicalRecordResponse } from '../mappers/medical-visit-edit.mapper';
import {
  assertNextVisitAt,
  assertPrescriptionDates,
  assertRequestsAttachable,
  assertStandaloneVisitInput,
  assertVisitAuthor,
} from '../policies/medical.policy';
import {
  assertCaseCancellableByEdit,
  assertCaseOpenableByEdit,
  assertClosedCaseEdit,
  assertClosedCaseInjuriesHealed,
  assertFollowUpEditFields,
  assertInjuryEdits,
  assertVisitEditable,
  assertVisitEditHasChanges,
  ConclusionChange,
  resolveConclusionChange,
  resolveEditHealth,
} from '../policies/medical-visit-edit.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import type {
  MedicalCaseCancelledEvent,
  MedicalCaseOpenedEvent,
} from '../types/medical-events.types';
import type { LaterHealthChange } from '../types/medical-visit.types';
import { CareScheduleWritesService } from '../shared/care-schedule-writes.service';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { MedicalVisitWritesService } from './medical-visit-writes.service';

/**
 * Bối cảnh của một lần sửa đã qua mọi kiểm tra, dùng cho bước ghi.
 */
interface EditPlan {
  caseClosed: boolean;
  kind: MedicalVisitKind;
  conclusion: MedicalVisitConclusion | null;
  conclusionChange: ConclusionChange;
  nextVisitBefore: Date | null;
  nextVisitAt: Date | null;
  currentRequestIds: string[];
  addedRequests: MedicalExamRequestEntity[];
  removedRequestIds: string[];
  markers: InjuryMarkerEntity[];
  prescriptions: PrescriptionEntity[];
  nextStatus: HorseHealthStatus;
  healthOutcome: VisitEditHealthOutcome;
  laterChange: LaterHealthChange | null;
}

/**
 * Các bước ghi của một lần sửa dùng chung transaction, người sửa, lý do và mã chức năng.
 */
interface EditContext {
  manager: EntityManager;
  visit: MedicalRecordEntity;
  horse: HorseEntity;
  callerId: string;
  reason: string;
  feature: AuditFeature;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

@Injectable()
export class MedicalVisitEditsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MedicalRecordEntity)
    private readonly medicalRecords: Repository<MedicalRecordEntity>,
    private readonly access: MedicalAccessService,
    private readonly visitWrites: MedicalVisitWritesService,
    private readonly horseHealth: HorseHealthService,
    private readonly measurements: HorseMeasurementsService,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
    private readonly scheduleWrites: CareScheduleWritesService,
    private readonly checkups: MedicalCheckupsService,
  ) {}

  /**
   * Sửa một buổi khám, bắt buộc lý do
   *
   * - Chỉ Veterinarian (kiểm ở controller); phải có ít nhất một ô cần sửa ngoài lý do (400)
   * - Khóa row ngựa, rồi row buổi khám, rồi row bệnh án; ngựa đã chuyển nhượng hoặc đã mất: 409
   * - Chỉ bác sĩ ghi buổi khám mới được sửa (403), kiểm trước luật buổi đã hủy (409)
   * - Ô không gửi giữ nguyên; null xóa ô cho phép trống; danh sách gửi lên thay toàn bộ; chấn thương sửa theo id
   * - Sau khi gộp, kiểm lại các luật như lúc ghi buổi khám; bệnh án đã đóng không đặt ngày hẹn (400), không gắn thêm yêu cầu (409), chấn thương bị sửa phải đã lành (409)
   * - Đổi kết luận NORMAL sang ISSUE mở bệnh án (409 nếu ngựa đang có bệnh án mở hoặc đã có buổi khám sau buổi này); ISSUE sang NORMAL hủy bệnh án buổi này đã mở (409 nếu bệnh án đã đóng hoặc còn buổi khác)
   * - Đổi trạng thái sau khám: chưa có lần đổi sức khỏe nào sau buổi khám thì đổi cả sức khỏe ngựa (lý do là lý do sửa, event đổi sức khỏe); ngược lại chỉ đổi kết quả trên buổi khám
   * - Yêu cầu bị bỏ gắn về PENDING; yêu cầu gắn thêm chuyển EXAMINED và báo người gửi như lúc ghi
   * - Ngày hẹn tái khám lưu ở lịch tái khám (FOLLOW_UP) của bệnh án: đổi ngày thì dời lịch, xóa ngày thì xóa lịch, rồi đồng bộ trạng thái các lịch tái khám của bệnh án
   * - Một dòng nhật ký MEDICAL_RECORD ghi trước, sau các phần đổi và lý do; không có gì đổi thì không ghi nhật ký, không phát event
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param recordId UUID của buổi khám
   * @param body Các ô cần sửa và lý do
   * @returns Promise trả về buổi khám sau khi sửa kèm cách xử lý trạng thái sức khỏe
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc người gọi không phải bác sĩ ghi buổi khám
   * @throws NotFoundException Nếu không có buổi khám, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu không có gì để sửa hoặc nội dung sau khi gộp không hợp lệ
   * @throws UnprocessableEntityException Nếu số đo mới bất thường mà chưa xác nhận
   * @throws ConflictException Nếu buổi khám đã hủy, ngựa đã chuyển nhượng hoặc đã mất, hoặc vi phạm luật bệnh án, yêu cầu khám, chấn thương
   */
  async editVisit(
    actor: Actor,
    recordId: string,
    body: UpdateMedicalVisitDto,
  ): Promise<EditMedicalRecordResponseDto> {
    assertVisitEditHasChanges(body);
    const now = new Date();
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
      assertVisitAuthor(visit.vetId, caller.id, VISIT_EDIT_AUTHOR_ONLY_MESSAGE);
      assertVisitEditable(visit.voidedAt);
      const medicalCase = visit.caseId
        ? await manager.findOneOrFail(MedicalCaseEntity, {
            where: { id: visit.caseId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      const plan = await this.planEdit(
        manager,
        visit,
        medicalCase,
        horse,
        body,
        now,
      );

      const ctx: EditContext = {
        manager,
        visit,
        horse,
        callerId: caller.id,
        reason: body.reason,
        feature:
          visit.kind === MedicalVisitKind.FOLLOW_UP
            ? MEDICAL_AUDIT_FEATURE.CASE_VISIT
            : MEDICAL_AUDIT_FEATURE.STANDALONE_VISIT,
        before: {},
        after: {},
      };
      await this.editMeasurements(ctx, body);
      await this.replacePrescriptions(ctx, plan.prescriptions, body);
      await this.editInjuries(ctx, plan, body);
      await this.editRequests(ctx, plan);
      const caseId = await this.editCase(ctx, medicalCase, plan, body);
      const health =
        plan.healthOutcome === VisitEditHealthOutcome.UPDATED
          ? await this.horseHealth.applyHealthStatus(manager, {
              horseId: horse.id,
              to: plan.nextStatus,
              actorId: caller.id,
              reason: body.reason,
              feature: ctx.feature,
            })
          : null;
      await this.visitWrites.publishHealthChanged(manager, horse, health);
      await this.editFollowUp(ctx, plan, caseId ?? medicalCase?.id ?? null);
      const columns = this.changedColumns(ctx, {
        diagnosis:
          body.diagnosis === undefined
            ? visit.diagnosis
            : body.diagnosis || null,
        careInstructions:
          body.careInstructions === undefined
            ? visit.careInstructions
            : body.careInstructions || null,
        resultingStatus: plan.nextStatus,
        kind: plan.kind,
        conclusion: plan.conclusion,
        caseId,
      });
      if (Object.keys(ctx.after).length > 0) {
        await manager.update(
          MedicalRecordEntity,
          { id: recordId },
          Object.keys(columns).length > 0
            ? columns
            : { updatedAt: () => 'CURRENT_TIMESTAMP' },
        );
        await this.audit.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.MEDICAL_RECORD,
          entityId: recordId,
          before: ctx.before,
          after: ctx.after,
          reason: body.reason,
          feature: ctx.feature,
        });
      }
      return this.toResponse(manager, recordId, plan);
    });
  }

  /**
   * Đọc dữ liệu liên quan và kiểm mọi luật của lần sửa trước khi ghi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param visit Buổi khám đã khóa
   * @param medicalCase Bệnh án chứa buổi khám đã khóa, null nếu buổi ngoài bệnh án
   * @param horse Ngựa đã khóa
   * @param body Nội dung lần sửa
   * @param now Thời điểm sửa
   * @returns Promise trả về bối cảnh của lần sửa
   * @throws BadRequestException Nếu nội dung sau khi gộp không hợp lệ
   * @throws ConflictException Nếu vi phạm luật bệnh án, yêu cầu khám hoặc chấn thương
   */
  private async planEdit(
    manager: EntityManager,
    visit: MedicalRecordEntity,
    medicalCase: MedicalCaseEntity | null,
    horse: HorseEntity,
    body: UpdateMedicalVisitDto,
    now: Date,
  ): Promise<EditPlan> {
    const isFollowUp = visit.kind === MedicalVisitKind.FOLLOW_UP;
    assertFollowUpEditFields(isFollowUp, body);
    const caseClosed = medicalCase?.status === MedicalCaseStatus.CLOSED;
    const kind = body.kind ?? visit.kind;
    const conclusion = body.conclusion ?? visit.conclusion;
    const conclusionChange = resolveConclusionChange(
      visit.conclusion,
      conclusion,
    );
    if (body.nextVisitAt) assertNextVisitAt(new Date(body.nextVisitAt), now);
    const nextVisitBefore =
      (await this.checkups.followUpDates([visit.id], manager)).get(visit.id) ??
      null;
    const nextVisitAt =
      body.nextVisitAt === undefined
        ? nextVisitBefore
        : body.nextVisitAt
          ? new Date(body.nextVisitAt)
          : null;
    const [currentRequests, markers, prescriptions] = await Promise.all([
      manager.find(MedicalExamRequestEntity, {
        where: {
          medicalRecordId: visit.id,
          status: ExamRequestStatus.EXAMINED,
        },
      }),
      manager.find(InjuryMarkerEntity, {
        where: { medicalRecordId: visit.id },
        relations: { injury: true },
        order: { createdAt: 'ASC' },
      }),
      manager.find(PrescriptionEntity, {
        where: { medicalRecordId: visit.id },
        order: { createdAt: 'ASC' },
      }),
    ]);
    const currentRequestIds = currentRequests.map((request) => request.id);
    const requestIds = body.requestIds ?? currentRequestIds;
    const addedIds = requestIds.filter((id) => !currentRequestIds.includes(id));
    assertClosedCaseEdit({
      caseClosed,
      setsNextVisit: Boolean(body.nextVisitAt),
      addedRequestCount: addedIds.length,
    });
    const removedInjuryIds = body.removedInjuryIds ?? [];
    assertInjuryEdits({
      edits: (body.injuries ?? []).map((edit) => ({
        injuryId: edit.injuryId,
        changesFixedInfo:
          edit.bodyRegion !== undefined ||
          edit.injuryType !== undefined ||
          edit.position !== undefined,
      })),
      removedIds: removedInjuryIds,
      firstDetectedHere: new Map(
        markers.map((marker) => [
          marker.injuryId,
          marker.injury.firstMedicalRecordId === visit.id,
        ]),
      ),
      otherMarkerCounts: new Map(
        await Promise.all(
          removedInjuryIds.map(
            async (injuryId) =>
              [
                injuryId,
                await manager.count(InjuryMarkerEntity, {
                  where: { injuryId, medicalRecordId: Not(visit.id) },
                }),
              ] as const,
          ),
        ),
      ),
    });
    if (caseClosed) {
      assertClosedCaseInjuriesHealed(
        true,
        await this.injuryStatusesAfterEdit(manager, visit, markers, body),
      );
    }
    assertPrescriptionDates(body.prescriptions ?? []);
    if (!isFollowUp) {
      assertStandaloneVisitInput({
        kind,
        conclusion: conclusion as MedicalVisitConclusion,
        initialDiagnosis:
          body.initialDiagnosis ??
          (conclusionChange === 'NONE'
            ? (medicalCase?.initialDiagnosis ?? undefined)
            : undefined),
        requestCount: requestIds.length,
        injuryCount: markers.length - removedInjuryIds.length,
        hasNextVisit: nextVisitAt !== null,
        hasOpenEndedPrescription: (body.prescriptions ?? prescriptions)
          .map(prescriptionContent)
          .some((item) => item.endDate === null),
      });
    }
    await this.checkConclusionChange(
      manager,
      visit,
      medicalCase,
      conclusionChange,
    );
    const addedRequests = addedIds.length
      ? await manager.find(MedicalExamRequestEntity, {
          where: { id: In(addedIds) },
          lock: { mode: 'pessimistic_write' },
        })
      : [];
    assertRequestsAttachable(addedIds, addedRequests, horse.id);
    const nextStatus = body.healthStatus ?? visit.resultingStatus;
    const laterChange =
      nextStatus !== visit.resultingStatus
        ? await this.access.latestHealthChangeAfterVisit(
            manager,
            horse.id,
            visit.id,
          )
        : null;
    return {
      caseClosed,
      kind,
      conclusion,
      conclusionChange,
      nextVisitBefore,
      nextVisitAt,
      currentRequestIds,
      addedRequests,
      removedRequestIds: currentRequestIds.filter(
        (id) => !requestIds.includes(id),
      ),
      markers,
      prescriptions,
      nextStatus,
      healthOutcome: resolveEditHealth({
        resultingStatus: visit.resultingStatus,
        nextStatus,
        currentStatus: horse.healthStatus,
        hasLaterChange: laterChange !== null,
      }),
      laterChange,
    };
  }

  /**
   * Tính mức hồi phục hiện tại của các chấn thương bị sửa mức hồi phục, như sau khi lần sửa được ghi
   *
   * - Ghi nhận của buổi khám đang sửa là ghi nhận mới nhất (không có buổi khám chưa hủy nào sau ghi nhận chấn thương đó): lấy mức mới gửi lên
   * - Ngược lại: giữ mức hiện tại của chấn thương
   *
   * @param manager EntityManager của transaction đang chạy
   * @param visit Buổi khám đã khóa
   * @param markers Ghi nhận chấn thương của buổi khám
   * @param body Nội dung lần sửa
   * @returns Promise trả về mức hồi phục sau khi sửa của từng chấn thương có gửi recoveryStatus
   */
  private async injuryStatusesAfterEdit(
    manager: EntityManager,
    visit: MedicalRecordEntity,
    markers: InjuryMarkerEntity[],
    body: UpdateMedicalVisitDto,
  ): Promise<Array<RecoveryStatus | undefined>> {
    const edits = (body.injuries ?? []).filter(
      (edit) => edit.recoveryStatus !== undefined,
    );
    if (edits.length === 0) return [];
    const current = await this.access.currentInjuryStatuses(
      manager,
      visit.horseId,
    );
    return Promise.all(
      edits.map(async (edit) => {
        const laterMarkers = await manager.count(InjuryMarkerEntity, {
          where: {
            injuryId: edit.injuryId,
            medicalRecord: {
              voidedAt: IsNull(),
              examDate: MoreThan(visit.examDate),
            },
          },
        });
        return laterMarkers > 0
          ? current.get(edit.injuryId)
          : (edit.recoveryStatus ??
              markers.find((marker) => marker.injuryId === edit.injuryId)
                ?.recoveryStatus);
      }),
    );
  }

  /**
   * Kiểm điều kiện mở hoặc hủy bệnh án khi kết luận đổi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param visit Buổi khám đã khóa
   * @param medicalCase Bệnh án buổi khám đã mở, null nếu không có
   * @param change Việc với bệnh án
   * @returns Promise hoàn tất khi điều kiện thỏa
   * @throws ConflictException Nếu không mở hoặc không hủy được bệnh án
   */
  private async checkConclusionChange(
    manager: EntityManager,
    visit: MedicalRecordEntity,
    medicalCase: MedicalCaseEntity | null,
    change: ConclusionChange,
  ): Promise<void> {
    if (change === 'OPEN_CASE') {
      const [openCase, laterVisitCount] = await Promise.all([
        this.access.findOpenCase(visit.horseId, manager),
        manager.count(MedicalRecordEntity, {
          where: {
            horseId: visit.horseId,
            voidedAt: IsNull(),
            examDate: MoreThan(visit.examDate),
          },
        }),
      ]);
      assertCaseOpenableByEdit({
        hasOpenCase: openCase !== null,
        laterVisitCount,
      });
    }
    if (change === 'CANCEL_CASE' && medicalCase) {
      const otherActiveVisits = await manager.count(MedicalRecordEntity, {
        where: {
          caseId: medicalCase.id,
          voidedAt: IsNull(),
          id: Not(visit.id),
        },
      });
      assertCaseCancellableByEdit(medicalCase.status, otherActiveVisits);
    }
  }

  /**
   * Sửa số đo của buổi khám qua module horses, ghi phần đổi vào nhật ký sửa
   *
   * @param ctx Bối cảnh ghi của lần sửa
   * @param body Nội dung lần sửa
   * @returns Promise hoàn tất khi đã sửa
   * @throws BadRequestException Nếu số đo không hợp lệ hoặc không có trong buổi khám
   * @throws UnprocessableEntityException Nếu số đo mới bất thường mà chưa xác nhận
   */
  private async editMeasurements(
    ctx: EditContext,
    body: UpdateMedicalVisitDto,
  ): Promise<void> {
    if (!body.measurements?.length) return;
    const changes = await this.measurements.editExamMeasurements(ctx.manager, {
      medicalRecordId: ctx.visit.id,
      values: body.measurements,
      confirmAbnormal: body.confirmAbnormal === true,
      actorId: ctx.callerId,
      reason: ctx.reason,
      feature: ctx.feature,
    });
    if (changes.length === 0) return;
    ctx.before.measurements = changes.map(({ type, from }) => ({
      type,
      value: from,
    }));
    ctx.after.measurements = changes.map(({ type, to }) => ({
      type,
      value: to,
    }));
  }

  /**
   * Thay toàn bộ đơn thuốc của buổi khám khi danh sách mới khác danh sách cũ
   *
   * @param ctx Bối cảnh ghi của lần sửa
   * @param current Đơn thuốc hiện tại của buổi khám
   * @param body Nội dung lần sửa
   * @returns Promise hoàn tất khi đã thay
   */
  private async replacePrescriptions(
    ctx: EditContext,
    current: PrescriptionEntity[],
    body: UpdateMedicalVisitDto,
  ): Promise<void> {
    if (!body.prescriptions) return;
    const before = current.map(prescriptionContent);
    const after = body.prescriptions.map(prescriptionContent);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    await ctx.manager.delete(PrescriptionEntity, {
      medicalRecordId: ctx.visit.id,
    });
    await ctx.manager.save(
      after.map((item) =>
        ctx.manager.create(PrescriptionEntity, {
          ...item,
          medicalRecordId: ctx.visit.id,
        }),
      ),
    );
    ctx.before.prescriptions = before;
    ctx.after.prescriptions = after;
  }

  /**
   * Sửa mức hồi phục, ghi chú, thông tin cố định của các chấn thương trong buổi khám, hoặc xóa chấn thương phát hiện ở buổi này
   *
   * @param ctx Bối cảnh ghi của lần sửa
   * @param plan Bối cảnh của lần sửa
   * @param body Nội dung lần sửa
   * @returns Promise hoàn tất khi đã sửa
   */
  private async editInjuries(
    ctx: EditContext,
    plan: EditPlan,
    body: UpdateMedicalVisitDto,
  ): Promise<void> {
    const markerOf = new Map(
      plan.markers.map((marker) => [marker.injuryId, marker]),
    );
    const before: Array<Record<string, unknown>> = [];
    const after: Array<Record<string, unknown>> = [];
    for (const edit of body.injuries ?? []) {
      const marker = markerOf.get(edit.injuryId) as InjuryMarkerEntity;
      const markerChanges = pickChanged(
        { recoveryStatus: marker.recoveryStatus, notes: marker.notes },
        {
          recoveryStatus: edit.recoveryStatus ?? marker.recoveryStatus,
          notes: edit.notes === undefined ? marker.notes : edit.notes || null,
        },
      );
      const injuryChanges = pickChanged(
        {
          bodyRegion: marker.injury.bodyRegion,
          injuryType: marker.injury.injuryType,
          position: marker.injury.position,
        },
        {
          bodyRegion: edit.bodyRegion ?? marker.injury.bodyRegion,
          injuryType: edit.injuryType ?? marker.injury.injuryType,
          position: edit.position
            ? { x: edit.position.x, y: edit.position.y, z: edit.position.z }
            : marker.injury.position,
        },
      );
      if (Object.keys(markerChanges.after).length > 0) {
        await ctx.manager.update(
          InjuryMarkerEntity,
          { id: marker.id },
          markerChanges.after,
        );
      }
      if (Object.keys(injuryChanges.after).length > 0) {
        await ctx.manager.update(
          InjuryEntity,
          { id: edit.injuryId },
          injuryChanges.after,
        );
      }
      if (
        Object.keys(markerChanges.after).length +
          Object.keys(injuryChanges.after).length >
        0
      ) {
        before.push({
          injuryId: edit.injuryId,
          ...markerChanges.before,
          ...injuryChanges.before,
        });
        after.push({
          injuryId: edit.injuryId,
          ...markerChanges.after,
          ...injuryChanges.after,
        });
      }
    }
    for (const injuryId of body.removedInjuryIds ?? []) {
      const marker = markerOf.get(injuryId) as InjuryMarkerEntity;
      await ctx.manager.delete(InjuryMarkerEntity, { id: marker.id });
      await ctx.manager.delete(InjuryEntity, { id: injuryId });
      before.push({
        injuryId,
        bodyRegion: marker.injury.bodyRegion,
        injuryType: marker.injury.injuryType,
        position: marker.injury.position,
        recoveryStatus: marker.recoveryStatus,
        notes: marker.notes,
      });
      after.push({ injuryId, removed: true });
    }
    if (after.length === 0) return;
    ctx.before.injuries = before;
    ctx.after.injuries = after;
  }

  /**
   * Bỏ gắn các yêu cầu không còn trong danh sách (về PENDING) và gắn yêu cầu mới (EXAMINED, báo người gửi)
   *
   * @param ctx Bối cảnh ghi của lần sửa
   * @param plan Bối cảnh của lần sửa
   * @returns Promise hoàn tất khi đã cập nhật
   */
  private async editRequests(ctx: EditContext, plan: EditPlan): Promise<void> {
    if (
      plan.removedRequestIds.length === 0 &&
      plan.addedRequests.length === 0
    ) {
      return;
    }
    if (plan.removedRequestIds.length > 0) {
      await this.visitWrites.reopenRequests(ctx.manager, {
        recordId: ctx.visit.id,
        callerId: ctx.callerId,
        reason: ctx.reason,
        duplicateReason: DETACHED_ALERT_REQUEST_REASON,
        feature: ctx.feature,
        requestIds: plan.removedRequestIds,
      });
    }
    await this.visitWrites.markRequestsExamined(
      ctx.manager,
      {
        requests: plan.addedRequests,
        callerId: ctx.callerId,
        feature: ctx.feature,
      },
      ctx.visit.id,
    );
    ctx.before.requestIds = plan.currentRequestIds;
    ctx.after.requestIds = [
      ...plan.currentRequestIds.filter(
        (id) => !plan.removedRequestIds.includes(id),
      ),
      ...plan.addedRequests.map((request) => request.id),
    ];
  }

  /**
   * Mở, hủy bệnh án theo kết luận mới, hoặc sửa chẩn đoán ban đầu của bệnh án buổi khám đã mở
   *
   * - Mở bệnh án: ngày mở là thời điểm khám của buổi khám; event mở bệnh án ghi vào outbox
   * - Hủy bệnh án: lệnh khóa tách khỏi bệnh án; event hủy bệnh án ghi vào outbox
   *
   * @param ctx Bối cảnh ghi của lần sửa
   * @param medicalCase Bệnh án đã khóa của buổi khám, null nếu không có
   * @param plan Bối cảnh của lần sửa
   * @param body Nội dung lần sửa
   * @returns Promise trả về bệnh án của buổi khám sau khi sửa, null nếu buổi ngoài bệnh án
   */
  private async editCase(
    ctx: EditContext,
    medicalCase: MedicalCaseEntity | null,
    plan: EditPlan,
    body: UpdateMedicalVisitDto,
  ): Promise<string | null> {
    const { manager, horse } = ctx;
    if (plan.conclusionChange === 'OPEN_CASE') {
      const opened = await this.visitWrites.openCase(manager, {
        horseId: horse.id,
        callerId: ctx.callerId,
        openedAt: ctx.visit.examDate,
        initialDiagnosis: body.initialDiagnosis as string,
      });
      const event: MedicalCaseOpenedEvent = {
        eventId: randomUUID(),
        horseId: horse.id,
        caseId: opened.id,
        initialDiagnosis: opened.initialDiagnosis,
        ownerId: horse.ownerId,
      };
      await this.events.publish(manager, MEDICAL_CASE_OPENED_EVENT, event);
      return opened.id;
    }
    if (plan.conclusionChange === 'CANCEL_CASE' && medicalCase) {
      await this.visitWrites.cancelCase(
        manager,
        medicalCase,
        ctx.callerId,
        ctx.reason,
      );
      const event: MedicalCaseCancelledEvent = {
        eventId: randomUUID(),
        horseId: horse.id,
        caseId: medicalCase.id,
        reason: ctx.reason,
        ownerId: horse.ownerId,
      };
      await this.events.publish(manager, MEDICAL_CASE_CANCELLED_EVENT, event);
      return null;
    }
    if (
      medicalCase &&
      body.initialDiagnosis !== undefined &&
      body.initialDiagnosis !== medicalCase.initialDiagnosis
    ) {
      await manager.update(
        MedicalCaseEntity,
        { id: medicalCase.id },
        { initialDiagnosis: body.initialDiagnosis },
      );
      ctx.before.initialDiagnosis = medicalCase.initialDiagnosis;
      ctx.after.initialDiagnosis = body.initialDiagnosis;
    }
    return ctx.visit.caseId;
  }

  /**
   * Ghi ngày hẹn tái khám sau khi sửa vào lịch tái khám của bệnh án rồi đồng bộ trạng thái các lịch
   *
   * - Ngày hẹn đổi: ghi giá trị trước, sau vào nhật ký sửa
   * - Buổi khám không thuộc bệnh án nào (kể cả trước khi sửa): không có lịch tái khám
   *
   * @param ctx Bối cảnh ghi của lần sửa
   * @param plan Bối cảnh của lần sửa
   * @param caseId UUID bệnh án chứa buổi khám trước hoặc sau khi sửa, null nếu không có
   * @returns Promise hoàn tất khi đã ghi
   */
  private async editFollowUp(
    ctx: EditContext,
    plan: EditPlan,
    caseId: string | null,
  ): Promise<void> {
    if (plan.nextVisitAt?.getTime() !== plan.nextVisitBefore?.getTime()) {
      ctx.before.nextVisitAt = plan.nextVisitBefore;
      ctx.after.nextVisitAt = plan.nextVisitAt;
    }
    if (!caseId) return;
    await this.scheduleWrites.setVisitFollowUp(
      ctx.manager,
      ctx.visit,
      caseId,
      plan.nextVisitAt,
    );
    await this.scheduleWrites.syncCaseFollowUps(ctx.manager, caseId);
  }

  /**
   * Gom các cột của buổi khám có giá trị mới khác giá trị cũ, ghi phần đổi vào nhật ký sửa
   *
   * @param ctx Bối cảnh ghi của lần sửa
   * @param next Giá trị các cột sau khi sửa
   * @returns Các cột cần cập nhật
   */
  private changedColumns(
    ctx: EditContext,
    next: Pick<
      MedicalRecordEntity,
      | 'diagnosis'
      | 'careInstructions'
      | 'resultingStatus'
      | 'kind'
      | 'conclusion'
      | 'caseId'
    >,
  ): Partial<MedicalRecordEntity> {
    const { visit } = ctx;
    const changes = pickChanged(
      {
        diagnosis: visit.diagnosis,
        careInstructions: visit.careInstructions,
        resultingStatus: visit.resultingStatus,
        kind: visit.kind,
        conclusion: visit.conclusion,
        caseId: visit.caseId,
      },
      next,
    );
    Object.assign(ctx.before, changes.before);
    Object.assign(ctx.after, changes.after);
    return changes.after;
  }

  /**
   * Đọc lại buổi khám sau khi sửa và chuyển sang response
   *
   * @param manager EntityManager của transaction đang chạy
   * @param recordId UUID của buổi khám
   * @param plan Bối cảnh của lần sửa
   * @returns Promise trả về response của buổi khám kèm cách xử lý trạng thái sức khỏe
   */
  private async toResponse(
    manager: EntityManager,
    recordId: string,
    plan: EditPlan,
  ): Promise<EditMedicalRecordResponseDto> {
    const [visit, prescriptions, injuries] = await Promise.all([
      manager.findOneOrFail(MedicalRecordEntity, { where: { id: recordId } }),
      manager.find(PrescriptionEntity, {
        where: { medicalRecordId: recordId },
        order: { startDate: 'DESC' },
      }),
      manager.find(InjuryMarkerEntity, {
        where: { medicalRecordId: recordId },
        relations: { injury: true },
        order: { createdAt: 'ASC' },
      }),
    ]);
    return toEditMedicalRecordResponse(
      toMedicalRecordResponse(
        visit,
        prescriptions,
        injuries,
        true,
        true,
        false,
        plan.nextVisitAt,
      ),
      plan.healthOutcome,
      plan.laterChange,
    );
  }
}

/**
 * Nội dung một dòng đơn thuốc để so và ghi lại
 *
 * @param item Dòng đơn thuốc đã lưu hoặc gửi lên
 * @returns Tên thuốc, liều, tần suất, ngày bắt đầu và ngày kết thúc (null nếu không có)
 */
function prescriptionContent(item: {
  medicine: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
}): {
  medicine: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
} {
  return {
    medicine: item.medicine,
    dosage: item.dosage,
    frequency: item.frequency,
    startDate: item.startDate,
    endDate: item.endDate ?? null,
  };
}

/**
 * Tách các khóa có giá trị mới khác giá trị cũ (so ngày theo thời điểm, object theo JSON)
 *
 * @param current Giá trị hiện tại
 * @param next Giá trị sau khi sửa
 * @returns Giá trị trước và sau của các khóa đổi
 */
function pickChanged<T extends object>(
  current: T,
  next: T,
): { before: Partial<T>; after: Partial<T> } {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (!sameValue(current[key], next[key])) {
      before[key] = current[key];
      after[key] = next[key];
    }
  }
  return { before, after };
}

/**
 * So hai giá trị ô: ngày theo thời điểm, object theo JSON, còn lại so bằng
 *
 * @param a Giá trị thứ nhất
 * @param b Giá trị thứ hai
 * @returns true nếu hai giá trị bằng nhau
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }
  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null
  ) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

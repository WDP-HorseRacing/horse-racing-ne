import { ExamRequestStatus } from '../constants/exam-request.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { CareInstructionsResponseDto } from '../dto/care-instructions.response.dto';
import { CareScheduleResponseDto } from '../dto/care-schedule.response.dto';
import { CheckupAppointmentDto } from '../dto/checkup.dto';
import {
  CaseActiveLockDto,
  MedicalCostReportResponseDto,
} from '../dto/medical-case.response.dto';
import { ExamRequestResponseDto } from '../dto/exam-request.dto';
import {
  HealthHistoryItemDto,
  HealthStatusChangeResponseDto,
} from '../dto/health-status.dto';
import { HerdBlockDto, HerdCountsDto } from '../dto/medical-dashboard.dto';
import {
  InjuryMarkerResponseDto,
  InjuryTimelineItemDto,
} from '../dto/injury-marker.response.dto';
import { MedicalCaseResponseDto } from '../dto/medical-case.response.dto';
import { TrainingLockResponseDto } from '../dto/training-lock.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { PrescriptionResponseDto } from '../dto/prescription.response.dto';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import type { HealthHistoryRow } from '../health-statuses/health-statuses.repository';
import type { MedicalCostReportRow } from '../medical-records/medical-cases.repository';
import { healthPriority } from '../policies/medical.policy';
import type { HorseCheckupAnchorRow } from '../types/medical-checkup.types';
import type { HealthStatusChange } from '../../horses/shared/horse-health.service';
import type { HorseHealthStatus } from '../../horses/enums/horse-status.enum';

/**
 * Chuyển đơn thuốc sang DTO, chỉ thêm liều lượng và tần suất khi người gọi được xem.
 *
 * @param prescription Thực thể đơn thuốc
 * @param includeDosage Người gọi có được xem liều lượng, tần suất không (Horse Owner thì không)
 * @returns PrescriptionResponseDto - không có key dosage, frequency khi includeDosage là false
 */
export function toPrescriptionResponse(
  prescription: PrescriptionEntity,
  includeDosage: boolean,
): PrescriptionResponseDto {
  return {
    id: prescription.id,
    medicine: prescription.medicine,
    ...(includeDosage
      ? { dosage: prescription.dosage, frequency: prescription.frequency }
      : {}),
    startDate: prescription.startDate,
    endDate: prescription.endDate,
  };
}

/**
 * Chuyển một buổi khám kèm đơn thuốc và chấn thương sang DTO.
 *
 * @param record Thực thể buổi khám
 * @param prescriptions Các đơn thuốc của buổi khám
 * @param injuries Các chấn thương ghi trong buổi khám
 * @param includeDosage Người gọi có được xem liều lượng, tần suất của đơn thuốc không
 * @returns MedicalRecordResponseDto - Buổi khám kèm đơn thuốc, chấn thương
 */
export function toMedicalRecordResponse(
  record: MedicalRecordEntity,
  prescriptions: PrescriptionEntity[],
  injuries: InjuryMarkerEntity[],
  includeDosage: boolean,
): MedicalRecordResponseDto {
  return {
    id: record.id,
    horseId: record.horseId,
    kind: record.kind,
    caseId: record.caseId,
    conclusion: record.conclusion,
    examDate: record.examDate,
    diagnosis: record.diagnosis,
    resultingStatus: record.resultingStatus,
    careInstructions: record.careInstructions,
    nextVisitAt: record.nextVisitAt,
    vetId: record.vetId,
    voidedAt: record.voidedAt,
    voidReason: record.voidReason,
    replacesRecordId: record.replacesRecordId,
    prescriptions: prescriptions.map((prescription) =>
      toPrescriptionResponse(prescription, includeDosage),
    ),
    injuries: injuries.map(toInjuryMarkerResponse),
  };
}

/**
 * Chuyển bệnh án sang DTO, loại chi phí theo quyền người gọi.
 *
 * @param medicalCase Thực thể bệnh án
 * @param seesCost Người gọi có được xem chi phí không (Head Trainer thì không)
 * @param costHidden Chi phí thuộc giai đoạn sở hữu của chủ khác, phải ẩn với người gọi
 * @returns MedicalCaseResponseDto - không có key totalCost, costHidden khi seesCost là false; totalCost null khi bệnh án chưa đóng hoặc costHidden là true
 */
export function toMedicalCaseResponse(
  medicalCase: MedicalCaseEntity,
  seesCost: boolean,
  costHidden: boolean,
): MedicalCaseResponseDto {
  return {
    id: medicalCase.id,
    horseId: medicalCase.horseId,
    status: medicalCase.status,
    openedAt: medicalCase.openedAt,
    openedBy: medicalCase.openedBy,
    initialDiagnosis: medicalCase.initialDiagnosis,
    closedAt: medicalCase.closedAt,
    finalConclusion: medicalCase.finalConclusion,
    ...(seesCost
      ? { totalCost: costHidden ? null : costOf(medicalCase), costHidden }
      : {}),
  };
}

/**
 * Đọc chi phí bệnh án (cột bigint trả về dạng chuỗi) thành số, chỉ khi bệnh án đã đóng.
 *
 * @param medicalCase Thực thể bệnh án
 * @returns Chi phí VND, null khi bệnh án chưa đóng
 */
export function costOf(medicalCase: MedicalCaseEntity): number | null {
  return medicalCase.status === MedicalCaseStatus.CLOSED &&
    medicalCase.totalCost !== null
    ? Number(medicalCase.totalCost)
    : null;
}

/**
 * Chuyển vết thương sang DTO.
 *
 * @param injury Thực thể vết thương
 * @returns InjuryMarkerResponseDto - Vết thương
 */
export function toInjuryMarkerResponse(
  injury: InjuryMarkerEntity,
): InjuryMarkerResponseDto {
  return {
    id: injury.id,
    medicalRecordId: injury.medicalRecordId,
    bodyRegion: injury.bodyRegion,
    position: injury.position,
    injuryType: injury.injuryType,
    recoveryStatus: injury.recoveryStatus,
    notes: injury.notes,
  };
}

/**
 * Chuyển yêu cầu khám sang DTO; cần tải kèm quan hệ horse để lấy tên ngựa.
 *
 * @param request Thực thể yêu cầu khám đã tải kèm ngựa
 * @returns ExamRequestResponseDto - Yêu cầu khám
 */
export function toExamRequestResponse(
  request: MedicalExamRequestEntity,
): ExamRequestResponseDto {
  return {
    id: request.id,
    horseId: request.horseId,
    horseName: request.horse.name,
    requestedBy: request.requestedBy,
    requestedBySystem: request.requestedBy === null,
    source: request.source,
    urgent: request.urgent,
    description: request.description,
    status: request.status,
    dismissReason: request.dismissReason,
    handledBy: request.handledBy,
    handledBySystem:
      request.status !== ExamRequestStatus.PENDING &&
      request.handledBy === null,
    handledAt: request.handledAt,
    medicalRecordId: request.medicalRecordId,
    alertType: request.alertType,
    createdAt: request.createdAt,
  };
}

/**
 * Chuyển lệnh khóa huấn luyện sang DTO.
 *
 * @param lock Thực thể lệnh khóa
 * @returns TrainingLockResponseDto - releasedBySystem là true khi lệnh đã gỡ mà không có người gỡ
 */
export function toTrainingLockResponse(
  lock: TrainingLockEntity,
): TrainingLockResponseDto {
  return {
    id: lock.id,
    horseId: lock.horseId,
    caseId: lock.caseId,
    reason: lock.reason,
    lockStart: lock.lockStart,
    lockEnd: lock.lockEnd,
    status: lock.status,
    lockedBy: lock.lockedBy,
    releasedBy: lock.releasedBy,
    releasedBySystem:
      lock.status === TrainingLockStatus.RELEASED && lock.releasedBy === null,
    releasedAt: lock.releasedAt,
    releaseConclusion: lock.releaseConclusion,
  };
}

/**
 * Chuyển lịch chăm sóc sang DTO.
 *
 * @param schedule Thực thể lịch chăm sóc
 * @returns CareScheduleResponseDto - Lịch chăm sóc
 */
export function toCareScheduleResponse(
  schedule: CareScheduleEntity,
): CareScheduleResponseDto {
  return {
    id: schedule.id,
    horseId: schedule.horseId,
    type: schedule.type,
    dueAt: schedule.dueAt,
    assignedTo: schedule.assignedTo,
    status: schedule.status,
    completedAt: schedule.completedAt,
    completedBy: schedule.completedBy,
    cancelReason: schedule.cancelReason,
    notes: schedule.notes,
  };
}

/**
 * Chuyển chấn thương sang dòng diễn biến; cần tải kèm quan hệ medicalRecord.
 *
 * @param injury Thực thể chấn thương đã tải kèm buổi khám
 * @returns InjuryTimelineItemDto - Chấn thương kèm thời điểm khám và bệnh án
 */
export function toInjuryTimelineItem(
  injury: InjuryMarkerEntity,
): InjuryTimelineItemDto {
  return {
    ...toInjuryMarkerResponse(injury),
    examDate: injury.medicalRecord.examDate,
    caseId: injury.medicalRecord.caseId,
  };
}

/**
 * Chuyển ngày hẹn khám định kỳ (lịch ROUTINE_CHECKUP) sang DTO.
 *
 * @param appointment Thực thể lịch hẹn khám định kỳ
 * @returns CheckupAppointmentDto - Ngày hẹn đang hiệu lực
 */
export function toCheckupAppointment(
  appointment: CareScheduleEntity,
): CheckupAppointmentDto {
  return {
    id: appointment.id,
    horseId: appointment.horseId,
    scheduledAt: appointment.dueAt,
  };
}

/**
 * Chuyển lệnh khóa đang hiệu lực của bệnh án sang DTO cho bảng xem trước khi đóng.
 *
 * @param lock Thực thể lệnh khóa
 * @returns CaseActiveLockDto - Lệnh khóa đang hiệu lực
 */
export function toCaseActiveLock(lock: TrainingLockEntity): CaseActiveLockDto {
  return { id: lock.id, reason: lock.reason, lockEnd: lock.lockEnd };
}

/**
 * Dựng ghi chú chăm sóc đang hiệu lực của con ngựa từ buổi khám gần nhất chưa hủy
 *
 * - Không có buổi khám, hoặc buổi gần nhất để trống ghi chú: current = null (không còn hạn chế)
 *
 * @param horseId UUID của ngựa
 * @param latest Buổi khám gần nhất chưa hủy, null nếu chưa khám lần nào
 * @returns Ghi chú đang hiệu lực kèm buổi khám nguồn
 */
export function toCareInstructionsResponse(
  horseId: string,
  latest: Pick<
    MedicalRecordEntity,
    'id' | 'examDate' | 'careInstructions'
  > | null,
): CareInstructionsResponseDto {
  const note = latest?.careInstructions?.trim();
  return {
    horseId,
    current:
      latest && note
        ? {
            careInstructions: note,
            examDate: latest.examDate,
            medicalRecordId: latest.id,
          }
        : null,
  };
}

/**
 * Ánh xạ kết quả đổi trạng thái sức khỏe sang response
 *
 * @param horseId UUID của ngựa
 * @param change Trạng thái trước, sau và cờ có đổi hay không
 * @returns HealthStatusChangeResponseDto
 */
export function toHealthStatusChangeResponse(
  horseId: string,
  change: HealthStatusChange,
): HealthStatusChangeResponseDto {
  return {
    horseId,
    changed: change.changed,
    from: change.from,
    to: change.to,
  };
}

/**
 * Ánh xạ một lần đổi trạng thái sức khỏe đọc từ nhật ký sang response
 *
 * @param row Một lần đổi trạng thái sức khỏe
 * @returns HealthHistoryItemDto
 */
export function toHealthHistoryItem(
  row: HealthHistoryRow,
): HealthHistoryItemDto {
  return {
    changedAt: row.changedAt,
    from: row.from,
    to: row.to,
    reason: row.reason,
    feature: row.feature,
    actorId: row.actorId,
  };
}

/**
 * Dựng khối đàn ngựa của bảng điều khiển y tế
 *
 * - Đếm số ngựa theo từng trạng thái sức khỏe trên toàn bộ rows, không phụ thuộc healthStatus
 * - Danh sách ngựa chỉ giữ ngựa có trạng thái sức khỏe bằng healthStatus nếu có truyền
 * - Xếp ngựa theo mức ưu tiên sức khỏe, cùng mức thì theo tên tiếng Việt
 *
 * @param rows Đàn ngựa kèm mốc tính hạn, chưa lọc theo trạng thái sức khỏe
 * @param healthStatus Trạng thái sức khỏe để lọc danh sách ngựa; bỏ trống để lấy đủ
 * @returns HerdBlockDto gồm số đếm và danh sách ngựa
 */
export function toHerdBlock(
  rows: HorseCheckupAnchorRow[],
  healthStatus?: HorseHealthStatus,
): HerdBlockDto {
  const counts: HerdCountsDto = {
    QUARANTINED: 0,
    INJURED: 0,
    UNDER_OBSERVATION: 0,
    ELIGIBLE: 0,
  };
  for (const row of rows) counts[row.healthStatus] += 1;
  const horses = rows
    .filter((row) => !healthStatus || row.healthStatus === healthStatus)
    .map((row) => ({
      horseId: row.horseId,
      horseName: row.horseName,
      barnId: row.barnId,
      stallId: row.stallId,
      stallCode: row.stallCode,
      healthStatus: row.healthStatus,
    }))
    .sort(
      (a, b) =>
        healthPriority(a.healthStatus) - healthPriority(b.healthStatus) ||
        a.horseName.localeCompare(b.horseName, 'vi'),
    );
  return { counts, horses };
}

/**
 * Dựng báo cáo chi phí y tế theo ngựa trong một khoảng ngày đóng bệnh án
 *
 * @param from Ngày bắt đầu (YYYY-MM-DD)
 * @param to Ngày kết thúc (YYYY-MM-DD)
 * @param rows Chi phí và số bệnh án đã đóng của từng ngựa
 * @returns MedicalCostReportResponseDto kèm tổng số bệnh án và tổng chi phí
 */
export function toMedicalCostReport(
  from: string,
  to: string,
  rows: MedicalCostReportRow[],
): MedicalCostReportResponseDto {
  const items = rows.map((row) => ({
    horseId: row.horseId,
    horseName: row.horseName,
    caseCount: row.caseCount,
    totalCost: Number(row.totalCost),
  }));
  return {
    from,
    to,
    caseCount: items.reduce((sum, item) => sum + item.caseCount, 0),
    totalCost: items.reduce((sum, item) => sum + item.totalCost, 0),
    items,
  };
}

import { ExamRequestStatus } from '../constants/exam-request.enum';
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
import {
  DashboardHorseWithoutCaseDto,
  HerdBlockDto,
  HerdCountsDto,
} from '../dto/medical-dashboard.dto';
import {
  InjuryMarkerResponseDto,
  InjuryHistoryItemDto,
  InjuryResponseDto,
} from '../dto/injury-marker.response.dto';
import { MedicalCaseResponseDto } from '../dto/medical-case.response.dto';
import { TrainingLockResponseDto } from '../dto/training-lock.response.dto';
import {
  MedicalRecordResponseDto,
  VoidMedicalRecordResponseDto,
} from '../dto/medical-record.response.dto';
import { VisitVoidHealthOutcome } from '../constants/medical-visit.enum';
import type { LaterHealthChange } from '../types/medical-visit.types';
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
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';

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
 * Chuyển một buổi khám kèm đơn thuốc và chấn thương sang DTO, loại chi phí theo quyền người gọi.
 *
 * @param record Thực thể buổi khám
 * @param prescriptions Các đơn thuốc của buổi khám
 * @param injuries Các chấn thương ghi trong buổi khám
 * @param includeDosage Người gọi có được xem liều lượng, tần suất của đơn thuốc không
 * @param seesCost Người gọi có được xem chi phí không (Head Trainer thì không)
 * @param costHidden Buổi khám thuộc giai đoạn sở hữu của chủ khác, phải ẩn chi phí với người gọi
 * @returns MedicalRecordResponseDto - không có key cost, costHidden khi seesCost là false; cost null khi costHidden là true
 */
export function toMedicalRecordResponse(
  record: MedicalRecordEntity,
  prescriptions: PrescriptionEntity[],
  injuries: InjuryMarkerEntity[],
  includeDosage: boolean,
  seesCost: boolean,
  costHidden: boolean,
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
    ...(seesCost
      ? { cost: costHidden ? null : costOfVisit(record), costHidden }
      : {}),
    prescriptions: prescriptions.map((prescription) =>
      toPrescriptionResponse(prescription, includeDosage),
    ),
    injuries: injuries.map(toInjuryMarkerResponse),
  };
}

/**
 * Gắn kết quả xử lý trạng thái sức khỏe vào response của buổi khám vừa hủy
 *
 * @param record Response của buổi khám sau khi hủy
 * @param healthOutcome Cách trạng thái sức khỏe của ngựa được xử lý
 * @param laterChange Lần đổi sức khỏe mới nhất sau buổi khám, null nếu không có
 * @returns VoidMedicalRecordResponseDto - laterHealthChange chỉ có giá trị khi healthOutcome là KEPT_LATER_CHANGE
 */
export function toVoidMedicalRecordResponse(
  record: MedicalRecordResponseDto,
  healthOutcome: VisitVoidHealthOutcome,
  laterChange: LaterHealthChange | null,
): VoidMedicalRecordResponseDto {
  return {
    ...record,
    healthOutcome,
    laterHealthChange:
      healthOutcome === VisitVoidHealthOutcome.KEPT_LATER_CHANGE && laterChange
        ? {
            changedAt: laterChange.changedAt,
            changedBy: laterChange.changedBy,
            to: laterChange.to,
          }
        : null,
  };
}

/**
 * Chuyển bệnh án sang DTO, kèm tổng chi phí người gọi được xem.
 *
 * @param medicalCase Thực thể bệnh án
 * @param totalCost Tổng chi phí người gọi được xem (VND); undefined khi người gọi không được xem chi phí (Head Trainer)
 * @returns MedicalCaseResponseDto - không có key totalCost khi totalCost là undefined
 */
export function toMedicalCaseResponse(
  medicalCase: MedicalCaseEntity,
  totalCost: number | undefined,
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
    ...(totalCost !== undefined ? { totalCost } : {}),
  };
}

/**
 * Đọc chi phí buổi khám (cột bigint trả về dạng chuỗi) thành số.
 *
 * @param record Buổi khám
 * @returns Chi phí VND
 */
export function costOfVisit(record: Pick<MedicalRecordEntity, 'cost'>): number {
  return Number(record.cost);
}

/**
 * Chuyển một lần ghi nhận chấn thương sang DTO, kèm vùng cơ thể, tọa độ, loại của chấn thương.
 *
 * @param marker Lần ghi nhận đã tải kèm chấn thương (relation injury)
 * @returns InjuryMarkerResponseDto - Lần ghi nhận chấn thương tại một buổi khám
 */
export function toInjuryMarkerResponse(
  marker: InjuryMarkerEntity,
): InjuryMarkerResponseDto {
  return {
    id: marker.id,
    medicalRecordId: marker.medicalRecordId,
    injuryId: marker.injuryId,
    bodyRegion: marker.injury.bodyRegion,
    position: marker.injury.position,
    injuryType: marker.injury.injuryType,
    recoveryStatus: marker.recoveryStatus,
    notes: marker.notes,
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
    incidentId: request.incidentId,
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
    assigneeType: schedule.assigneeType,
    assignedTo: schedule.assignedTo,
    status: schedule.status,
    completedAt: schedule.completedAt,
    completedBy: schedule.completedBy,
    cancelReason: schedule.cancelReason,
    notes: schedule.notes,
  };
}

/**
 * Gom các lần ghi nhận thành danh sách chấn thương, mỗi chấn thương kèm diễn biến và mức hồi phục hiện tại.
 *
 * - Thứ tự chấn thương theo lần ghi nhận đầu tiên của nó trong danh sách đầu vào
 * - Mức hiện tại là mức của lần ghi nhận cuối cùng
 *
 * @param markers Các lần ghi nhận đã tải kèm chấn thương và buổi khám, xếp theo thời điểm khám rồi thời điểm ghi tăng dần
 * @returns InjuryResponseDto[] - Các chấn thương
 */
export function toInjuryResponses(
  markers: InjuryMarkerEntity[],
): InjuryResponseDto[] {
  const byInjury = new Map<string, InjuryResponseDto>();
  for (const marker of markers) {
    const item: InjuryHistoryItemDto = {
      medicalRecordId: marker.medicalRecordId,
      examDate: marker.medicalRecord.examDate,
      caseId: marker.medicalRecord.caseId,
      recoveryStatus: marker.recoveryStatus,
      notes: marker.notes,
    };
    const found = byInjury.get(marker.injuryId);
    if (found) {
      found.history.push(item);
      found.currentRecoveryStatus = item.recoveryStatus;
      continue;
    }
    byInjury.set(marker.injuryId, {
      id: marker.injury.id,
      horseId: marker.injury.horseId,
      bodyRegion: marker.injury.bodyRegion,
      injuryType: marker.injury.injuryType,
      position: marker.injury.position,
      firstMedicalRecordId: marker.injury.firstMedicalRecordId,
      firstExamDate: item.examDate,
      currentRecoveryStatus: item.recoveryStatus,
      history: [item],
    });
  }
  return [...byInjury.values()];
}

/**
 * Chuyển ngày hẹn khám định kỳ (lịch ROUTINE_CHECKUP) sang DTO.
 *
 * - Kèm bác sĩ phụ trách; tên lấy từ relation assignee, chưa load thì null
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
    assignedTo: appointment.assignedTo,
    assignedToName: appointment.assignee?.fullName ?? null,
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
      barnName: row.barnName,
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
 * Dựng khối ngựa Chấn thương hoặc Cách ly chưa có bệnh án đang mở của bảng điều khiển y tế
 *
 * - Chỉ giữ ngựa Chấn thương hoặc Cách ly không nằm trong openCaseHorseIds
 * - Cách ly lên trước Chấn thương; cùng trạng thái thì chuyển trạng thái lâu nhất lên trước, không rõ thời điểm (null) lên đầu
 *
 * @param rows Đàn ngựa đang hiển thị trên bảng điều khiển
 * @param openCaseHorseIds Các con ngựa đang có bệnh án mở
 * @param sinceByHorse Thời điểm chuyển sang trạng thái hiện tại theo từng con ngựa
 * @returns Danh sách ngựa chưa có bệnh án
 */
export function toHorsesWithoutCase(
  rows: HorseCheckupAnchorRow[],
  openCaseHorseIds: Set<string>,
  sinceByHorse: Map<string, Date | null>,
): DashboardHorseWithoutCaseDto[] {
  return rows
    .filter(
      (row) =>
        (row.healthStatus === HorseHealthStatus.INJURED ||
          row.healthStatus === HorseHealthStatus.QUARANTINED) &&
        !openCaseHorseIds.has(row.horseId),
    )
    .map((row) => ({
      horseId: row.horseId,
      horseName: row.horseName,
      barnId: row.barnId,
      barnName: row.barnName,
      stallId: row.stallId,
      stallCode: row.stallCode,
      healthStatus: row.healthStatus,
      since: sinceByHorse.get(row.horseId) ?? null,
    }))
    .sort(
      (a, b) =>
        healthPriority(a.healthStatus) - healthPriority(b.healthStatus) ||
        (a.since?.getTime() ?? 0) - (b.since?.getTime() ?? 0),
    );
}

/**
 * Dựng báo cáo chi phí y tế theo ngựa trong một khoảng ngày khám
 *
 * @param from Ngày bắt đầu (YYYY-MM-DD)
 * @param to Ngày kết thúc (YYYY-MM-DD)
 * @param rows Chi phí và số buổi khám chưa hủy của từng ngựa
 * @returns MedicalCostReportResponseDto kèm tổng số buổi khám và tổng chi phí
 */
export function toMedicalCostReport(
  from: string,
  to: string,
  rows: MedicalCostReportRow[],
): MedicalCostReportResponseDto {
  const items = rows.map((row) => ({
    horseId: row.horseId,
    horseName: row.horseName,
    visitCount: row.visitCount,
    totalCost: Number(row.totalCost),
  }));
  return {
    from,
    to,
    visitCount: items.reduce((sum, item) => sum + item.visitCount, 0),
    totalCost: items.reduce((sum, item) => sum + item.totalCost, 0),
    items,
  };
}

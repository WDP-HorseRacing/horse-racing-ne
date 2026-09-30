import { ExamRequestStatus } from '../constants/exam-request.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { CareInstructionsResponseDto } from '../dto/care-instructions.response.dto';
import { CareScheduleResponseDto } from '../dto/care-schedule.response.dto';
import { CheckupAppointmentDto } from '../dto/checkup.dto';
import { CaseActiveLockDto } from '../dto/medical-case.response.dto';
import { ExamRequestResponseDto } from '../dto/exam-request.dto';
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
 * Chuyển bệnh án sang DTO, loại chi phí theo quyền người gọi (F3.10 mục 8).
 *
 * @param medicalCase Thực thể bệnh án
 * @param seesCost Người gọi có được xem chi phí không (Head Trainer thì không)
 * @returns MedicalCaseResponseDto - không có key totalCost khi seesCost là false; totalCost null khi bệnh án chưa đóng
 */
export function toMedicalCaseResponse(
  medicalCase: MedicalCaseEntity,
  seesCost: boolean,
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
    ...(seesCost ? { totalCost: costOf(medicalCase) } : {}),
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

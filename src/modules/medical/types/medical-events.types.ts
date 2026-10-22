import type { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import type { CareScheduleType } from '../constants/care-schedule.enum';
import type { ExamRequestStatus } from '../constants/exam-request.enum';

/**
 * Trường chung của mọi domain event y tế.
 *
 * - eventId: khóa chống gửi trùng thông báo; thao tác của người dùng sinh mới mỗi lần, việc định kỳ dùng UUID cố định theo hạn
 */
interface MedicalEventBase {
  eventId: string;
  horseId: string;
}

/**
 * Yêu cầu khám mức Khẩn do người dùng tạo.
 */
export interface ExamRequestUrgentEvent extends MedicalEventBase {
  requestId: string;
  description: string;
}

/**
 * Bác sĩ khám xong hoặc bỏ qua yêu cầu khám do một người gửi.
 *
 * - requestedBy: người gửi yêu cầu, người nhận thông báo
 * - incidentId: sự cố tại chuồng sinh ra yêu cầu, null nếu yêu cầu không từ sự cố
 * - dismissReason: lý do bỏ qua, null khi đã khám
 */
export interface ExamRequestHandledEvent extends MedicalEventBase {
  requestId: string;
  requestedBy: string;
  incidentId: string | null;
  outcome: ExamRequestStatus.EXAMINED | ExamRequestStatus.DISMISSED;
  description: string;
  dismissReason: string | null;
}

/**
 * Bác sĩ đặt khóa huấn luyện.
 *
 * - ownerId: chủ của ngựa lúc phát event, null nếu ngựa không có chủ
 */
export interface TrainingLockSetEvent extends MedicalEventBase {
  lockId: string;
  reason: string;
  expectedEnd: string | null;
  ownerId: string | null;
}

/**
 * Bác sĩ gỡ khóa huấn luyện; gỡ do chuyển nhượng không phát event này.
 *
 * - ownerId: chủ của ngựa lúc phát event, null nếu ngựa không có chủ
 */
export interface TrainingLockReleasedEvent extends MedicalEventBase {
  lockId: string;
  conclusion: string;
  ownerId: string | null;
}

/**
 * Bác sĩ đóng bệnh án nhưng giữ khóa huấn luyện, kèm ngày dự kiến gỡ mới.
 *
 * - expectedEnd: ngày dự kiến gỡ khóa mới, chuỗi ISO
 * - ownerId: chủ của ngựa lúc phát event, null nếu ngựa không có chủ
 */
export interface TrainingLockKeptEvent extends MedicalEventBase {
  lockId: string;
  caseId: string;
  expectedEnd: string;
  ownerId: string | null;
}

/**
 * Một con ngựa có thể đã tiếp xúc với ngựa vừa bị Cách ly, chụp lúc đổi trạng thái.
 *
 * - sameBarn: đang ở cùng khu
 * - sameGroom: đang do cùng Groom phụ trách
 */
export interface ExposedHorse {
  horseId: string;
  horseName: string;
  sameBarn: boolean;
  sameGroom: boolean;
}

/**
 * Trạng thái sức khỏe vừa đổi.
 *
 * - exposedHorses: chỉ có khi to = QUARANTINED; các con ngựa có thể đã tiếp xúc, theo tên
 * - ownerId: chủ của ngựa lúc phát event, null nếu ngựa không có chủ
 */
export interface HealthChangedEvent extends MedicalEventBase {
  from: HorseHealthStatus;
  to: HorseHealthStatus;
  exposedHorses?: ExposedHorse[];
  ownerId: string | null;
}

/**
 * Bệnh án vừa mở.
 *
 * - ownerId: chủ của ngựa lúc phát event, null nếu ngựa không có chủ
 */
export interface MedicalCaseOpenedEvent extends MedicalEventBase {
  caseId: string;
  initialDiagnosis: string;
  ownerId: string | null;
}

/**
 * Bệnh án vừa đóng, kèm chi phí chụp lúc đóng.
 *
 * - totalCost: tổng chi phí các buổi khám chưa hủy của bệnh án
 * - ownerId: chủ của ngựa lúc đóng, null nếu ngựa không có chủ
 * - ownerCost: phần chi phí thuộc các giai đoạn sở hữu của ownerId, null khi ownerId null
 */
export interface MedicalCaseClosedEvent extends MedicalEventBase {
  caseId: string;
  totalCost: number;
  ownerId: string | null;
  ownerCost: number | null;
}

/**
 * Bệnh án mở nhầm vừa bị hủy cùng buổi mở bệnh án.
 *
 * - ownerId: chủ của ngựa lúc phát event, null nếu ngựa không có chủ
 */
export interface MedicalCaseCancelledEvent extends MedicalEventBase {
  caseId: string;
  reason: string;
  ownerId: string | null;
}

/**
 * Chi phí của một buổi khám vừa được điều chỉnh.
 *
 * - caseId: bệnh án chứa buổi khám, null với buổi khám ngoài bệnh án
 * - examDate: thời điểm khám, chuỗi ISO
 * - costOwnerId: chủ của giai đoạn sở hữu chứa ngày khám, null nếu lúc đó ngựa không có chủ
 */
export interface MedicalVisitCostAdjustedEvent extends MedicalEventBase {
  recordId: string;
  caseId: string | null;
  examDate: string;
  fromCost: number;
  toCost: number;
  costOwnerId: string | null;
}

/**
 * Ngựa đến hạn khám định kỳ mà chưa có ngày hẹn khám.
 */
export interface CheckupDueEvent extends MedicalEventBase {
  dueDate: string;
}

/**
 * Ngựa quá hạn khám định kỳ trên số ngày ngưỡng.
 */
export interface CheckupOverdueEvent extends MedicalEventBase {
  dueDate: string;
}

/**
 * Lịch chăm sóc định kỳ đến hạn.
 */
export interface CareScheduleDueEvent extends MedicalEventBase {
  scheduleId: string;
  type: CareScheduleType;
  dueDate: string;
  assigneeId: string | null;
}

/**
 * Ngày hẹn khám định kỳ hoặc lịch tái khám tới ngày hẹn mà chưa khám.
 *
 * - type: ROUTINE_CHECKUP hoặc FOLLOW_UP; payload cũ không có trường này là ROUTINE_CHECKUP
 * - scheduledAt: ngày giờ hẹn, chuỗi ISO
 */
export interface CheckupAppointmentDueEvent extends MedicalEventBase {
  appointmentId: string;
  type?: CareScheduleType;
  scheduledAt: string;
}

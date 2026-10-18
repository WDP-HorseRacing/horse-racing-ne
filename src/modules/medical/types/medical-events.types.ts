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
 * - dismissReason: lý do bỏ qua, null khi đã khám
 */
export interface ExamRequestHandledEvent extends MedicalEventBase {
  requestId: string;
  requestedBy: string;
  outcome: ExamRequestStatus.EXAMINED | ExamRequestStatus.DISMISSED;
  description: string;
  dismissReason: string | null;
}

/**
 * Bác sĩ đặt khóa huấn luyện.
 */
export interface TrainingLockSetEvent extends MedicalEventBase {
  lockId: string;
  reason: string;
  expectedEnd: string | null;
}

/**
 * Bác sĩ gỡ khóa huấn luyện; gỡ do chuyển nhượng không phát event này.
 */
export interface TrainingLockReleasedEvent extends MedicalEventBase {
  lockId: string;
  conclusion: string;
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
 */
export interface HealthChangedEvent extends MedicalEventBase {
  from: HorseHealthStatus;
  to: HorseHealthStatus;
  exposedHorses?: ExposedHorse[];
}

/**
 * Bệnh án vừa mở.
 */
export interface MedicalCaseOpenedEvent extends MedicalEventBase {
  caseId: string;
  initialDiagnosis: string;
}

/**
 * Bệnh án vừa đóng, kèm chi phí chốt.
 */
export interface MedicalCaseClosedEvent extends MedicalEventBase {
  caseId: string;
  totalCost: number;
}

/**
 * Bệnh án mở nhầm vừa bị hủy cùng buổi mở bệnh án.
 */
export interface MedicalCaseCancelledEvent extends MedicalEventBase {
  caseId: string;
  reason: string;
}

/**
 * Chi phí bệnh án đã đóng vừa được điều chỉnh.
 */
export interface MedicalCaseCostAdjustedEvent extends MedicalEventBase {
  caseId: string;
  fromCost: number;
  toCost: number;
  /** Chủ của giai đoạn sở hữu chứa thời điểm đóng bệnh án, null nếu lúc đó ngựa không có chủ */
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

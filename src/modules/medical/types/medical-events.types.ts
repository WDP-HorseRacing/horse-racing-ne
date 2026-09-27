import type { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import type { CareScheduleType } from '../constants/care-schedule.enum';

/**
 * Trường chung của mọi domain event Flow 3.
 *
 * - eventId: khóa chống gửi trùng thông báo; thao tác của người dùng sinh mới mỗi lần, việc định kỳ dùng UUID cố định theo hạn
 */
interface MedicalEventBase {
  eventId: string;
  horseId: string;
}

/**
 * Yêu cầu khám mức Khẩn do người dùng tạo (F3.4 mục 6).
 */
export interface ExamRequestUrgentEvent extends MedicalEventBase {
  requestId: string;
  description: string;
}

/**
 * Bác sĩ đặt khóa huấn luyện (F3.8).
 */
export interface TrainingLockSetEvent extends MedicalEventBase {
  lockId: string;
  reason: string;
  expectedEnd: Date | null;
}

/**
 * Bác sĩ gỡ khóa huấn luyện (F3.8); gỡ do chuyển nhượng không phát event này.
 */
export interface TrainingLockReleasedEvent extends MedicalEventBase {
  lockId: string;
  conclusion: string;
}

/**
 * Trạng thái sức khỏe vừa đổi (F3.7).
 */
export interface HealthChangedEvent extends MedicalEventBase {
  from: HorseHealthStatus;
  to: HorseHealthStatus;
}

/**
 * Bệnh án vừa mở (F3.5).
 */
export interface MedicalCaseOpenedEvent extends MedicalEventBase {
  caseId: string;
  initialDiagnosis: string;
}

/**
 * Bệnh án vừa đóng, kèm chi phí chốt (F3.9).
 */
export interface MedicalCaseClosedEvent extends MedicalEventBase {
  caseId: string;
  totalCost: number;
}

/**
 * Bệnh án mở nhầm vừa bị hủy cùng buổi mở bệnh án (F3.6 mục 8).
 */
export interface MedicalCaseCancelledEvent extends MedicalEventBase {
  caseId: string;
  reason: string;
}

/**
 * Chi phí bệnh án đã đóng vừa được điều chỉnh (F3.9 mục 8).
 */
export interface MedicalCaseCostAdjustedEvent extends MedicalEventBase {
  caseId: string;
  fromCost: number;
  toCost: number;
}

/**
 * Ngựa quá hạn khám định kỳ trên số ngày ngưỡng (F3.2 mục 6).
 */
export interface CheckupOverdueEvent extends MedicalEventBase {
  dueDate: string;
}

/**
 * Lịch chăm sóc định kỳ đến hạn (F3.11 mục 5).
 */
export interface CareScheduleDueEvent extends MedicalEventBase {
  scheduleId: string;
  type: CareScheduleType;
  dueDate: string;
  assigneeId: string | null;
}

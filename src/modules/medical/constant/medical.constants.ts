import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import type { ReadOnlyLifecycleStatus } from '../../horses/types/horse.types';

/**
 * Chu kỳ khám định kỳ cố định cho toàn câu lạc bộ, tính bằng ngày.
 */
export const MEDICAL_CHECKUP_CYCLE_DAYS = 30;

/**
 * Còn từ 0 tới số ngày này trước hạn khám thì ngựa ở trạng thái Đến hạn.
 */
export const CHECKUP_DUE_SOON_DAYS = 3;

/**
 * Quá hạn khám trên số ngày này thì gửi thông báo HIGH.
 */
export const CHECKUP_OVERDUE_NOTIFY_DAYS = 7;

/**
 * Lý do ghi vào yêu cầu khám và lịch chăm sóc bị hệ thống tự hủy khi ngựa chuyển nhượng.
 */
export const TRANSFER_CANCEL_REASON = 'Do chuyển nhượng';

/**
 * Thông báo 409 khi chuyển nhượng ngựa còn bệnh án đang mở.
 */
export const OPEN_CASE_BLOCKS_TRANSFER_MESSAGE =
  'Ngựa còn bệnh án đang điều trị, bác sĩ cần đóng bệnh án trước khi chuyển nhượng';

/**
 * Lý do ghi vào yêu cầu khám và lịch chăm sóc bị hệ thống tự hủy khi ghi nhận ngựa mất.
 */
export const DECEASED_CANCEL_REASON = 'Do ngựa mất';

/**
 * Thông báo 400 khi đóng bệnh án kèm ghi nhận ngựa mất mà vẫn chọn gỡ hoặc giữ lệnh khóa.
 */
export const NO_LOCK_CHOICE_ON_DEATH_MESSAGE =
  'Ngựa mất thì lệnh khóa huấn luyện tự gỡ, không chọn gỡ hay giữ khóa';

/**
 * Thông báo 409 khi ghi nhận ngựa mất mà còn bệnh án đang mở.
 */
export const OPEN_CASE_BLOCKS_DECEASED_MESSAGE =
  'Ngựa còn bệnh án đang điều trị, bác sĩ cần đóng bệnh án trước khi ghi nhận ngựa mất';

/**
 * Thông báo 403 khi bác sĩ hủy buổi khám do bác sĩ khác ghi.
 */
export const VISIT_VOID_AUTHOR_ONLY_MESSAGE =
  'Chỉ bác sĩ ghi phiếu khám mới được hủy phiếu này';

/**
 * Thông báo 403 khi bác sĩ điều chỉnh chi phí buổi khám do bác sĩ khác ghi.
 */
export const VISIT_COST_AUTHOR_ONLY_MESSAGE =
  'Chỉ bác sĩ ghi phiếu khám mới được điều chỉnh chi phí phiếu này';

/**
 * Lý do bỏ qua yêu cầu khám tự sinh khi buổi khám bị hủy mà ngựa đã có yêu cầu đang chờ cùng loại cảnh báo.
 */
export const DUPLICATE_ALERT_REQUEST_REASON =
  'Buổi khám bị hủy, ngựa đã có yêu cầu đang chờ cùng loại cảnh báo';

/**
 * Thông báo 403 khi bác sĩ sửa buổi khám do bác sĩ khác ghi.
 */
export const VISIT_EDIT_AUTHOR_ONLY_MESSAGE =
  'Chỉ bác sĩ ghi phiếu khám mới được sửa phiếu này';

/**
 * Lý do bỏ qua yêu cầu khám tự sinh bị bỏ gắn khỏi buổi khám khi ngựa đã có yêu cầu đang chờ cùng loại cảnh báo.
 */
export const DETACHED_ALERT_REQUEST_REASON =
  'Bỏ gắn khỏi buổi khám, ngựa đã có yêu cầu đang chờ cùng loại cảnh báo';

/**
 * Câu chặn khi còn bệnh án đang mở, theo trạng thái làm hồ sơ chỉ được xem
 */
export const OPEN_CASE_BLOCKS_READ_ONLY_MESSAGES: Record<
  ReadOnlyLifecycleStatus,
  string
> = {
  [HorseLifecycleStatus.TRANSFERRED]: OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
  [HorseLifecycleStatus.DECEASED]: OPEN_CASE_BLOCKS_DECEASED_MESSAGE,
};

/**
 * Lý do tự hủy yêu cầu khám và lịch chăm sóc, theo trạng thái làm hồ sơ chỉ được xem
 */
export const READ_ONLY_CANCEL_REASONS: Record<ReadOnlyLifecycleStatus, string> =
  {
    [HorseLifecycleStatus.TRANSFERRED]: TRANSFER_CANCEL_REASON,
    [HorseLifecycleStatus.DECEASED]: DECEASED_CANCEL_REASON,
  };

/**
 * Các role được xem lịch sử y tế của ngựa: buổi khám, bệnh án, lịch sử sức khỏe
 */
export const MEDICAL_READER_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.HORSE_OWNER,
];

/**
 * Mã chức năng ghi vào cột feature của nhật ký thao tác, theo từng nhóm use case y tế
 */
export const MEDICAL_AUDIT_FEATURE = {
  CHECKUP_SCHEDULE: AuditFeature.MED_CHECKUP,
  STANDALONE_VISIT: AuditFeature.MED_VISIT,
  EXAM_REQUEST: AuditFeature.MED_EXAM_REQUEST,
  OPEN_CASE: AuditFeature.MED_CASE_OPEN,
  CASE_VISIT: AuditFeature.MED_CASE_VISIT,
  HEALTH_STATUS: AuditFeature.MED_HEALTH,
  TRAINING_LOCK: AuditFeature.MED_TRAIN_LOCK,
  CLOSE_CASE: AuditFeature.MED_CASE_CLOSE,
  CARE_SCHEDULE: AuditFeature.MED_CARE,
} as const;

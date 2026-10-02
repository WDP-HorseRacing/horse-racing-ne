import { UserRole } from '../../../common/enums/role.enum';
import { MEASUREMENT_BACKDATE_MAX_DAYS } from '../../horses/constants/horse.constants';

/**
 * Chu kỳ khám định kỳ cố định cho toàn câu lạc bộ, tính bằng ngày (Flow 3 mục III.3.1).
 */
export const MEDICAL_CHECKUP_CYCLE_DAYS = 30;

/**
 * Còn từ 0 tới số ngày này trước hạn khám thì ngựa ở trạng thái Đến hạn (F3.2 mục 2).
 */
export const CHECKUP_DUE_SOON_DAYS = 3;

/**
 * Quá hạn khám trên số ngày này thì gửi thông báo HIGH (Flow 3 mục III.7).
 */
export const CHECKUP_OVERDUE_NOTIFY_DAYS = 7;

/**
 * Số ngày tối đa được nhập lùi thời điểm khám; dùng chung hằng của F1.5 để hai bên luôn khớp (Flow 3 mục III.2.5).
 */
export const VISIT_BACKDATE_MAX_DAYS = MEASUREMENT_BACKDATE_MAX_DAYS;

/**
 * Lý do ghi vào yêu cầu khám và lịch chăm sóc bị hệ thống tự hủy khi ngựa chuyển nhượng (Flow 3 mục III.8).
 */
export const TRANSFER_CANCEL_REASON = 'Do chuyển nhượng';

/**
 * Thông báo 409 khi chuyển nhượng ngựa còn bệnh án đang mở (F1.8 mục 2, Flow 3 mục III.8).
 */
export const OPEN_CASE_BLOCKS_TRANSFER_MESSAGE =
  'Ngựa còn bệnh án đang điều trị, bác sĩ cần đóng bệnh án trước khi chuyển nhượng';

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
  CHECKUP_SCHEDULE: 'F3.2',
  STANDALONE_VISIT: 'F3.3',
  EXAM_REQUEST: 'F3.4',
  OPEN_CASE: 'F3.5',
  CASE_VISIT: 'F3.6',
  HEALTH_STATUS: 'F3.7',
  TRAINING_LOCK: 'F3.8',
  CLOSE_CASE: 'F3.9',
  CARE_SCHEDULE: 'F3.11',
} as const;

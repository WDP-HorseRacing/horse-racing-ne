import { SessionParticipantStatus } from '../enums/session-participant-status.enum';

/** Điểm danh và báo vắng mở sớm hơn giờ bắt đầu buổi tập (ms): 30 phút */
export const CHECK_IN_OPENS_BEFORE_MS = 30 * 60 * 1000;

/** Báo sẵn sàng và bắt đầu lượt tập mở sớm hơn giờ bắt đầu buổi tập (ms): 15 phút */
export const START_OPENS_BEFORE_MS = 15 * 60 * 1000;

/** Lý do vắng ghi vào lượt chưa điểm danh khi buổi tập đã hết giờ */
export const MISSED_CHECK_IN_REASON = 'Hết giờ, chưa điểm danh';

/** Lượt đang tập được hệ thống tự hoàn thành khi buổi đã quá giờ kết thúc một khoảng (ms): 30 phút */
export const STUCK_RUN_GRACE_MS = 30 * 60 * 1000;

/** Lý do ghi nhật ký khi hệ thống tự hoàn thành lượt đang tập bị quên */
export const AUTO_COMPLETED_RUN_REASON = 'Hệ thống tự hoàn thành';

/** Lý do ghi nhật ký khi hệ thống tự hoàn thành lớp đã qua ngày kết thúc */
export const AUTO_COMPLETED_CLASS_REASON = 'Hệ thống tự hoàn thành lớp';

/** Lý do ghi nhật ký khi hệ thống chấm lại điều kiện tập của lượt sau khi khóa huấn luyện hoặc sức khỏe ngựa đổi */
export const ELIGIBILITY_REEVALUATED_REASON =
  'Hệ thống chấm lại điều kiện tập sau khi đổi khóa huấn luyện hoặc sức khỏe';

/** Trạng thái lượt đã tập xong: hoàn thành hoặc dừng sớm */
export const TRAINED_PARTICIPANT_STATUSES: readonly SessionParticipantStatus[] =
  [SessionParticipantStatus.COMPLETED, SessionParticipantStatus.STOPPED];

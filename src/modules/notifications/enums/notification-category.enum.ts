/**
 * Loại nghiệp vụ của thông báo, dùng để lọc và chọn biểu tượng hiển thị.
 *
 * - MEASUREMENT_ALERT: cảnh báo chỉ số cơ thể (sốt, giảm cân)
 * - BARN_ASSIGNED: ngựa được xếp vào khu
 * - GROOM_ASSIGNMENT: phân công chăm ngựa thay đổi hoặc kết thúc
 * - MEDICAL_CASE: bệnh án được mở, hủy, đóng hoặc điều chỉnh chi phí
 * - TRAINING_LOCK: khóa huấn luyện được đặt hoặc gỡ
 * - HEALTH_STATUS: trạng thái sức khỏe thay đổi
 * - EXAM_REQUEST: yêu cầu khám khẩn
 * - CARE_REMINDER: nhắc khám định kỳ, lịch chăm sóc đến hạn
 * - HORSE_LIFECYCLE: vòng đời ngựa thay đổi (ngựa đã mất)
 * - OWNERSHIP: chủ sở hữu ngựa thay đổi do chuyển nhượng nội bộ
 * - PERFORMANCE_ALERT: nhịp tim của ngựa vượt ngưỡng nguy hiểm khi đang tập
 * - DAILY_CHECKLIST: có việc mới trong checklist chăm sóc hôm nay
 */
export enum NotificationCategory {
  MEASUREMENT_ALERT = 'MEASUREMENT_ALERT',
  BARN_ASSIGNED = 'BARN_ASSIGNED',
  GROOM_ASSIGNMENT = 'GROOM_ASSIGNMENT',
  MEDICAL_CASE = 'MEDICAL_CASE',
  TRAINING_LOCK = 'TRAINING_LOCK',
  HEALTH_STATUS = 'HEALTH_STATUS',
  EXAM_REQUEST = 'EXAM_REQUEST',
  CARE_REMINDER = 'CARE_REMINDER',
  HORSE_LIFECYCLE = 'HORSE_LIFECYCLE',
  OWNERSHIP = 'OWNERSHIP',
  PERFORMANCE_ALERT = 'PERFORMANCE_ALERT',
  DAILY_CHECKLIST = 'DAILY_CHECKLIST',
}

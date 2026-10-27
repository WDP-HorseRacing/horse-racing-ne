/**
 * Loại đối tượng mà một thông báo trỏ tới, để client mở đúng màn hình chi tiết.
 *
 * - HORSE: hồ sơ ngựa, id là horseId
 * - MEDICAL_CASE: bệnh án, id là caseId
 * - TRAINING_LOCK: khóa huấn luyện, id là lockId
 * - SESSION_PARTICIPANT: lượt tập của ngựa trong một buổi, id là sessionParticipantId
 */
export enum NotificationResourceType {
  HORSE = 'HORSE',
  MEDICAL_CASE = 'MEDICAL_CASE',
  TRAINING_LOCK = 'TRAINING_LOCK',
  SESSION_PARTICIPANT = 'SESSION_PARTICIPANT',
}

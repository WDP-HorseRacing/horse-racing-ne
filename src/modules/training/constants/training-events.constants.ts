/**
 * Tên domain event phát khi Head Trainer hủy một buổi tập còn lượt chưa diễn ra.
 * Payload là TrainingSessionCancelledEvent; module notifications nghe event này để báo người dắt từng ngựa.
 */
export const TRAINING_SESSION_CANCELLED_EVENT = 'training.session.cancelled';

/**
 * Tên domain event phát khi Head Trainer giao người dắt một lượt tập cho Groom khác người dắt cũ.
 * Payload là TrainingRunGroomAssignedEvent; module notifications nghe event này để báo Groom được giao.
 */
export const TRAINING_RUN_GROOM_ASSIGNED_EVENT = 'training.run.groom_assigned';

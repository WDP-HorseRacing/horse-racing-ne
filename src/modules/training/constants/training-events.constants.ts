/**
 * Tên domain event phát khi Head Trainer hủy một buổi tập còn lượt chưa diễn ra.
 * Payload là TrainingSessionCancelledEvent; module notifications nghe event này để báo người dắt từng ngựa.
 */
export const TRAINING_SESSION_CANCELLED_EVENT = 'training.session.cancelled';

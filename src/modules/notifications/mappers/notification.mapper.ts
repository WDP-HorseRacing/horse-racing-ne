import type {
  NotificationCreatedPayload,
  NotificationDraft,
} from '../types/notification.types';

/**
 * Dòng notifications vừa được insert, đọc từ RETURNING (tên cột dạng snake_case của Postgres)
 */
export interface InsertedNotificationRow {
  id: string;
  recipient_id: string;
  created_at: Date;
}

/**
 * Dựng payload đẩy realtime (NOTIFICATION_CREATED_SOCKET_EVENT) cho một dòng thông báo vừa lưu
 *
 * - Chỉ gửi các field client cần hiển thị, không gửi eventId hay recipientId
 *
 * @param row Dòng notifications vừa insert
 * @param draft Nội dung thông báo đã dùng để insert
 * @returns Payload gửi qua socket
 */
export function toNotificationCreatedPayload(
  row: InsertedNotificationRow,
  draft: NotificationDraft,
): NotificationCreatedPayload {
  return {
    id: row.id,
    type: draft.type,
    priority: draft.priority,
    title: draft.title,
    message: draft.message,
    createdAt: row.created_at,
  };
}

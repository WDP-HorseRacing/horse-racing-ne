import type { NotificationPriority } from '../constants/notification-priority.enum';
import type { NotificationResourceType } from '../constants/notification-resource-type.enum';
import type { NotificationType } from '../constants/notification-type.enum';

/**
 * Đối tượng mà thông báo trỏ tới để client mở đúng màn hình chi tiết.
 */
export interface NotificationResource {
  type: NotificationResourceType;
  id: string;
}

/**
 * Nội dung một thông báo cần gửi cho nhiều người nhận.
 *
 * eventId là khóa chống trùng: cùng eventId và cùng người nhận thì chỉ lưu một lần.
 * eventId là id ổn định của sự kiện gốc (vd id bản ghi đo).
 */
export interface NotificationDraft {
  eventId: string;
  recipientIds: string[];
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  resource: NotificationResource | null;
}

/**
 * Payload đẩy realtime tới client qua sự kiện NOTIFICATION_CREATED_SOCKET_EVENT.
 */
export interface NotificationCreatedPayload {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  resource: NotificationResource | null;
  createdAt: Date;
}

/**
 * Thông tin khu của một con ngựa dùng để chọn người nhận.
 *
 * headTrainerId là null khi ngựa chưa có khu, khu đã xóa, khu chưa có Head Trainer
 * hoặc Head Trainer đó không còn ACTIVE; mọi trường hợp đều nghĩa là "không có Head Trainer để báo".
 */
export interface HorseBarnContact {
  horseName: string;
  headTrainerId: string | null;
}

/**
 * Thông tin khu dùng để báo Head Trainer khi ngựa được xếp vào khu.
 */
export interface BarnContact {
  barnName: string;
  headTrainerId: string | null;
}

/**
 * Người liên quan tới một con ngựa để nhận thông báo y tế.
 *
 * headTrainerId, ownerId là null khi không có người đang hoạt động để báo.
 */
export interface HorseMedicalContact {
  horseName: string;
  headTrainerId: string | null;
  ownerId: string | null;
}

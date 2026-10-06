import type { NotificationResponseDto } from '../dto/notification.dto';
import type { NotificationCategory } from '../enums/notification-category.enum';
import type { NotificationPriority } from '../enums/notification-priority.enum';
import type {
  NotificationRecord,
  NotificationResource,
} from '../schemas/notification.schema';

/**
 * Nội dung một thông báo cần gửi cho nhiều người nhận.
 *
 * eventId là khóa chống trùng: cùng eventId và cùng người nhận thì chỉ lưu một lần.
 * eventId là id ổn định của sự kiện gốc (vd id bản ghi đo).
 */
export interface NotificationDraft {
  eventId: string;
  recipientIds: string[];
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  resource: NotificationResource | null;
}

/**
 * Payload đẩy realtime tới client qua sự kiện NOTIFICATION_CREATED_SOCKET_EVENT.
 */
export type NotificationCreatedPayload = Omit<
  NotificationResponseDto,
  'readAt'
>;

/**
 * Một kênh giao thông báo đã lưu tới người nhận (socket, push mobile...).
 */
export interface NotificationChannel {
  /**
   * Giao các thông báo vừa lưu tới người nhận của từng thông báo
   *
   * @param notifications Các thông báo vừa được lưu mới
   * @returns Promise hoàn tất khi kênh đã giao xong hoặc đã chuyển cho hàng đợi
   */
  deliver(notifications: NotificationRecord[]): Promise<void>;
}

/**
 * Dữ liệu một job gửi push trong hàng đợi NOTIFICATION_PUSH_QUEUE.
 *
 * - retryTokens: chỉ có khi gửi lại; là các token lần trước gặp lỗi tạm thời. Không có thì gửi tới mọi thiết bị của người nhận
 */
export interface NotificationPushJob {
  notificationId: string;
  retryTokens?: string[];
}

/**
 * Kết quả phân loại các token gửi push lỗi.
 *
 * - dead: token không còn hiệu lực, cần xóa
 * - retry: token gặp lỗi tạm thời, cần gửi lại
 * - failed: token lỗi vì lý do khác, chỉ cần ghi log (kèm mã lỗi và thông báo lỗi)
 */
export interface PushFailureClassification {
  dead: string[];
  retry: string[];
  failed: Array<{ token: string; code: string; message: string }>;
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

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter } from 'mongoose';
import type { Actor } from '../../../common/types/actor';
import { decodeKeysetCursor } from '../../../common/utils/keyset-cursor';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  NOTIFICATION_ALL_READ_SOCKET_EVENT,
  NOTIFICATION_READ_SOCKET_EVENT,
} from '../constants/notification.constants';
import {
  NotificationListQueryDto,
  NotificationPageResponseDto,
  NotificationResponseDto,
  NotificationMarkAllReadResponseDto,
  NotificationUnreadCountResponseDto,
} from '../dto';
import {
  toNotificationPage,
  toNotificationResponse,
} from '../mappers/notification.mapper';
import { NotificationRecord } from '../schemas/notification.schema';
import { NotificationAccessService } from '../shared/notification-access.service';
import type { NotificationReadPayload } from '../types/notification.types';

@Injectable()
export class NotificationInboxService {
  private readonly logger = new Logger(NotificationInboxService.name);

  constructor(
    @InjectModel(NotificationRecord.name)
    private readonly notifications: Model<NotificationRecord>,
    private readonly access: NotificationAccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Lấy một trang thông báo của người gọi, mới nhất trước
   *
   * - Sắp theo (createdAt, id) giảm dần; trang sau lấy các thông báo đứng sau cursor nên không lặp hay sót khi có thông báo mới chen vào
   * - unreadOnly: chỉ lấy thông báo chưa đọc; priority: chỉ lấy đúng mức ưu tiên
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Bộ lọc, số phần tử mỗi trang và cursor của trang trước
   * @returns Promise trả về các thông báo của trang và nextCursor (null khi đã hết)
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws BadRequestException Nếu cursor sai định dạng
   */
  async list(
    actor: Actor,
    query: NotificationListQueryDto,
  ): Promise<NotificationPageResponseDto> {
    const recipientId = await this.access.currentUserId(actor);
    const filter: QueryFilter<NotificationRecord> = { recipientId };
    if (query.unreadOnly) filter.readAt = null;
    if (query.priority) filter.priority = query.priority;
    if (query.cursor) {
      const cursor = decodeKeysetCursor(query.cursor);
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    const rows = await this.notifications
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .lean<NotificationRecord[]>();

    return toNotificationPage(rows, query.limit);
  }

  /**
   * Đếm số thông báo chưa đọc của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về số thông báo chưa đọc
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async unreadCount(actor: Actor): Promise<NotificationUnreadCountResponseDto> {
    const recipientId = await this.access.currentUserId(actor);
    const count = await this.notifications.countDocuments({
      recipientId,
      readAt: null,
    });
    return { count };
  }

  /**
   * Lấy một thông báo của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của thông báo
   * @returns Promise trả về thông báo
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có thông báo hoặc thông báo thuộc người khác
   */
  async get(actor: Actor, id: string): Promise<NotificationResponseDto> {
    const recipientId = await this.access.currentUserId(actor);
    return toNotificationResponse(
      await this.access.findOwnNotification(recipientId, id),
    );
  }

  /**
   * Đánh dấu một thông báo của người gọi là đã đọc
   *
   * - Thông báo đã đọc rồi thì giữ nguyên thời điểm đọc cũ và vẫn trả về bình thường
   * - Chỉ khi thông báo vừa chuyển sang đã đọc: đẩy NOTIFICATION_READ_SOCKET_EVENT tới mọi thiết bị của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của thông báo
   * @returns Promise trả về thông báo sau khi đánh dấu
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có thông báo hoặc thông báo thuộc người khác
   */
  async markRead(actor: Actor, id: string): Promise<NotificationResponseDto> {
    const recipientId = await this.access.currentUserId(actor);
    const marked = await this.notifications
      .findOneAndUpdate(
        { _id: id, recipientId, readAt: null },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .lean<NotificationRecord>();
    if (marked) {
      const payload: NotificationReadPayload = { id: marked._id };
      this.emitToRecipient(
        recipientId,
        NOTIFICATION_READ_SOCKET_EVENT,
        payload,
      );
    }
    return toNotificationResponse(
      marked ?? (await this.access.findOwnNotification(recipientId, id)),
    );
  }

  /**
   * Đánh dấu mọi thông báo chưa đọc của người gọi là đã đọc
   *
   * - Có ít nhất một thông báo vừa chuyển sang đã đọc: đẩy NOTIFICATION_ALL_READ_SOCKET_EVENT tới mọi thiết bị của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về số thông báo vừa chuyển sang đã đọc
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async markAllRead(actor: Actor): Promise<NotificationMarkAllReadResponseDto> {
    const recipientId = await this.access.currentUserId(actor);
    const result = await this.notifications.updateMany(
      { recipientId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    if (result.modifiedCount > 0) {
      this.emitToRecipient(recipientId, NOTIFICATION_ALL_READ_SOCKET_EVENT, {});
    }
    return { count: result.modifiedCount };
  }

  /**
   * Đẩy sự kiện socket tới room của người nhận; lỗi chỉ được log
   *
   * @param recipientId UUID tài khoản người nhận
   * @param event Tên sự kiện socket
   * @param payload Dữ liệu gửi kèm sự kiện
   */
  private emitToRecipient(
    recipientId: string,
    event: string,
    payload: object,
  ): void {
    try {
      this.realtime.emitToUser(recipientId, event, payload);
    } catch (error) {
      this.logger.warn(
        `Không đẩy được sự kiện ${event} tới ${recipientId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

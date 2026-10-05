import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter } from 'mongoose';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  NotificationListQueryDto,
  NotificationPageResponseDto,
  NotificationResponseDto,
  NotificationsMarkedReadResponseDto,
  NotificationUnreadCountResponseDto,
} from '../dto';
import { toNotificationResponse } from '../mappers/notification.mapper';
import { Notification } from '../schemas/notification.schema';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notification-cursor';

@Injectable()
export class NotificationInboxService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    private readonly dataSource: DataSource,
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
    const recipientId = await this.recipientId(actor);
    const filter: QueryFilter<Notification> = { recipientId };
    if (query.unreadOnly) filter.readAt = null;
    if (query.priority) filter.priority = query.priority;
    if (query.before) {
      const cursor = decodeNotificationCursor(query.before);
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    const rows = await this.notifications
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .lean<Notification[]>();

    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map(toNotificationResponse),
      nextCursor:
        rows.length > query.limit
          ? encodeNotificationCursor({
              createdAt: last.createdAt,
              id: last._id,
            })
          : null,
    };
  }

  /**
   * Đếm số thông báo chưa đọc của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về số thông báo chưa đọc
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async unreadCount(actor: Actor): Promise<NotificationUnreadCountResponseDto> {
    const recipientId = await this.recipientId(actor);
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
    const recipientId = await this.recipientId(actor);
    return toNotificationResponse(await this.findOwn(recipientId, id));
  }

  /**
   * Đánh dấu một thông báo của người gọi là đã đọc
   *
   * - Thông báo đã đọc rồi thì giữ nguyên thời điểm đọc cũ và vẫn trả về bình thường
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của thông báo
   * @returns Promise trả về thông báo sau khi đánh dấu
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có thông báo hoặc thông báo thuộc người khác
   */
  async markRead(actor: Actor, id: string): Promise<NotificationResponseDto> {
    const recipientId = await this.recipientId(actor);
    const marked = await this.notifications
      .findOneAndUpdate(
        { _id: id, recipientId, readAt: null },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .lean<Notification>();
    return toNotificationResponse(
      marked ?? (await this.findOwn(recipientId, id)),
    );
  }

  /**
   * Đánh dấu mọi thông báo chưa đọc của người gọi là đã đọc
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về số thông báo vừa chuyển sang đã đọc
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async markAllRead(actor: Actor): Promise<NotificationsMarkedReadResponseDto> {
    const recipientId = await this.recipientId(actor);
    const result = await this.notifications.updateMany(
      { recipientId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { updated: result.modifiedCount };
  }

  /**
   * Lấy id tài khoản local của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về UUID người dùng
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  private async recipientId(actor: Actor): Promise<string> {
    const user = await currentUserForActor(this.dataSource.manager, actor);
    return user.id;
  }

  /**
   * Tìm thông báo theo id trong hộp thư của một người nhận
   *
   * @param recipientId UUID người nhận
   * @param id UUID của thông báo
   * @returns Promise trả về thông báo
   * @throws NotFoundException Nếu không có thông báo hoặc thông báo thuộc người khác
   */
  private async findOwn(
    recipientId: string,
    id: string,
  ): Promise<Notification> {
    const notification = await this.notifications
      .findOne({ _id: id, recipientId })
      .lean<Notification>();
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    return notification;
  }
}

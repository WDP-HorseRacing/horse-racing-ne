import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import { NotificationRecord } from '../schemas/notification.schema';

@Injectable()
export class NotificationAccessService {
  constructor(
    @InjectModel(NotificationRecord.name)
    private readonly notifications: Model<NotificationRecord>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy id tài khoản local của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về UUID người dùng
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async currentUserId(actor: Actor): Promise<string> {
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
  async findOwnNotification(
    recipientId: string,
    id: string,
  ): Promise<NotificationRecord> {
    const notification = await this.notifications
      .findOne({ _id: id, recipientId })
      .lean<NotificationRecord>();
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    return notification;
  }
}

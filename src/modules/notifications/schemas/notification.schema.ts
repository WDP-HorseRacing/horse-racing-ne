import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';

/**
 * Đối tượng mà thông báo trỏ tới (subdocument, không có _id riêng).
 */
@Schema({ _id: false })
export class NotificationResource {
  @Prop({ type: String, required: true, enum: NotificationResourceType })
  type!: NotificationResourceType;

  @Prop({ type: String, required: true })
  id!: string;
}

/**
 * Thông báo gửi tới một người nhận, lưu ở collection `notifications`.
 *
 * - Mỗi người nhận một document; `readAt` null là chưa đọc
 * - (eventId, recipientId) là duy nhất: gửi lại cùng sự kiện không sinh thông báo trùng
 */
@Schema({ collection: 'notifications', versionKey: false })
export class NotificationRecord {
  @Prop({ type: String, default: () => randomUUID() })
  _id!: string;

  @Prop({ type: String, required: true })
  eventId!: string;

  @Prop({ type: String, required: true })
  recipientId!: string;

  @Prop({ type: String, required: true, enum: NotificationCategory })
  category!: NotificationCategory;

  @Prop({ type: String, required: true, enum: NotificationPriority })
  priority!: NotificationPriority;

  @Prop({ type: String, required: true, maxlength: 200 })
  title!: string;

  @Prop({ type: String, required: true })
  message!: string;

  @Prop({ type: NotificationResource, default: null })
  resource!: NotificationResource | null;

  @Prop({ type: Date, default: null })
  readAt!: Date | null;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

export const NotificationSchema =
  SchemaFactory.createForClass(NotificationRecord);

NotificationSchema.index(
  { eventId: 1, recipientId: 1 },
  { unique: true, name: 'notifications_event_recipient_uq' },
);
NotificationSchema.index(
  { recipientId: 1, createdAt: -1, _id: -1 },
  { name: 'notifications_recipient_created_idx' },
);
NotificationSchema.index(
  { recipientId: 1, readAt: 1, createdAt: -1, _id: -1 },
  { name: 'notifications_recipient_unread_idx' },
);

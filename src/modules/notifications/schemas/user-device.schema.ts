import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { DevicePlatform } from '../constants/device-platform.enum';

/**
 * Thiết bị nhận push FCM của người dùng, lưu ở collection `user_devices`.
 *
 * - `_id` là FCM registration token: mỗi thiết bị chỉ thuộc một người dùng tại một thời điểm
 */
@Schema({ collection: 'user_devices', versionKey: false })
export class UserDevice {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, required: true, enum: DevicePlatform })
  platform!: DevicePlatform;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;
}

export const UserDeviceSchema = SchemaFactory.createForClass(UserDevice);

UserDeviceSchema.index({ userId: 1 }, { name: 'user_devices_user_idx' });

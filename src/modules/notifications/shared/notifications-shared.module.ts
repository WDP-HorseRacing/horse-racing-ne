import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notification,
  NotificationSchema,
} from '../schemas/notification.schema';
import { UserDevice, UserDeviceSchema } from '../schemas/user-device.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: UserDevice.name, schema: UserDeviceSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class NotificationsSharedModule {}

import { Module } from '@nestjs/common';
import { NotificationDeliveryModule } from './delivery/notification-delivery.module';
import { UserDevicesModule } from './devices/user-devices.module';
import { NotificationInboxModule } from './inbox/notification-inbox.module';

@Module({
  imports: [
    NotificationDeliveryModule,
    NotificationInboxModule,
    UserDevicesModule,
  ],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { NotificationDeliveryModule } from './delivery/delivery.module';
import { UserDevicesModule } from './user-devices/user-devices.module';
import { NotificationInboxModule } from './inbox/inbox.module';

@Module({
  imports: [
    NotificationDeliveryModule,
    NotificationInboxModule,
    UserDevicesModule,
  ],
})
export class NotificationsModule {}

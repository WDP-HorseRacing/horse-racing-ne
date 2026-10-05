import { Module } from '@nestjs/common';
import { NotificationDeliveryModule } from './delivery/notification-delivery.module';
import { NotificationInboxModule } from './inbox/notification-inbox.module';

@Module({
  imports: [NotificationDeliveryModule, NotificationInboxModule],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationDeliveryModule } from './delivery/notification-delivery.module';

@Module({
  imports: [NotificationDeliveryModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}

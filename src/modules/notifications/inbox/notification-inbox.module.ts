import { Module } from '@nestjs/common';
import { NotificationsSharedModule } from '../shared/notifications-shared.module';
import { NotificationInboxController } from './notification-inbox.controller';
import { NotificationInboxService } from './notification-inbox.service';

@Module({
  imports: [NotificationsSharedModule],
  controllers: [NotificationInboxController],
  providers: [NotificationInboxService],
})
export class NotificationInboxModule {}

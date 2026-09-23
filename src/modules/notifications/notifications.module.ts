import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationEntity } from './entities/notification.entity';
import { GroomAssignmentChangedListener } from './listeners/groom-assignment-changed.listener';
import { HorseBarnAssignedListener } from './listeners/horse-barn-assigned.listener';
import { HorseGroomReleasedListener } from './listeners/horse-groom-released.listener';
import { HorseMeasurementAlertListener } from './listeners/horse-measurement-alert.listener';
import { NotificationRecipientsRepository } from './repositories/notification-recipients.repository';
import { HorseNotificationsService } from './services/horse-notifications.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity]), RealtimeModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    HorseNotificationsService,
    NotificationRecipientsRepository,
    HorseMeasurementAlertListener,
    HorseBarnAssignedListener,
    HorseGroomReleasedListener,
    GroomAssignmentChangedListener,
  ],
})
export class NotificationsModule {}

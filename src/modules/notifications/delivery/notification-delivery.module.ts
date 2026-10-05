import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { NotificationsSharedModule } from '../shared/notifications-shared.module';
import { NOTIFICATION_CHANNELS } from './channels/notification-channel';
import { RealtimeChannel } from './channels/realtime.channel';
import { GroomAssignmentChangedListener } from './listeners/groom-assignment-changed.listener';
import { HorseBarnAssignedListener } from './listeners/horse-barn-assigned.listener';
import { HorseGroomReleasedListener } from './listeners/horse-groom-released.listener';
import { HorseMeasurementAlertListener } from './listeners/horse-measurement-alert.listener';
import { MedicalEventsListener } from './listeners/medical-events.listener';
import { NotificationRecipientsRepository } from './repositories/notification-recipients.repository';
import { HorseNotificationsService } from './services/horse-notifications.service';
import { MedicalNotificationsService } from './services/medical-notifications.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [NotificationsSharedModule, RealtimeModule],
  providers: [
    RealtimeChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [RealtimeChannel],
      useFactory: (realtime: RealtimeChannel) => [realtime],
    },
    NotificationsService,
    HorseNotificationsService,
    MedicalNotificationsService,
    NotificationRecipientsRepository,
    HorseMeasurementAlertListener,
    HorseBarnAssignedListener,
    HorseGroomReleasedListener,
    GroomAssignmentChangedListener,
    MedicalEventsListener,
  ],
})
export class NotificationDeliveryModule {}

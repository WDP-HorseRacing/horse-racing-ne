import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { Messaging } from 'firebase-admin/messaging';
import { FIREBASE_MESSAGING } from '../../../common/infrastructure/firebase/firebase.token';
import { NOTIFICATION_PUSH_QUEUE } from '../constants/notification.constants';
import { RealtimeModule } from '../../realtime/realtime.module';
import { NotificationsSharedModule } from '../shared/notifications-shared.module';
import { FcmChannel } from './channels/fcm.channel';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from './channels/notification-channel';
import { RealtimeChannel } from './channels/realtime.channel';
import { GroomAssignmentChangedListener } from './listeners/groom-assignment-changed.listener';
import { HorseBarnAssignedListener } from './listeners/horse-barn-assigned.listener';
import { HorseGroomReleasedListener } from './listeners/horse-groom-released.listener';
import { HorseMeasurementAlertListener } from './listeners/horse-measurement-alert.listener';
import { MedicalEventsListener } from './listeners/medical-events.listener';
import { NotificationPushProcessor } from './push/notification-push.processor';
import { NotificationRecipientsRepository } from './repositories/notification-recipients.repository';
import { HorseNotificationsService } from './services/horse-notifications.service';
import { MedicalNotificationsService } from './services/medical-notifications.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [
    NotificationsSharedModule,
    RealtimeModule,
    BullModule.registerQueue({ name: NOTIFICATION_PUSH_QUEUE }),
  ],
  providers: [
    RealtimeChannel,
    FcmChannel,
    NotificationPushProcessor,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [RealtimeChannel, FcmChannel, FIREBASE_MESSAGING],
      useFactory: (
        realtime: RealtimeChannel,
        fcm: FcmChannel,
        messaging: Messaging | null,
      ): NotificationChannel[] => (messaging ? [realtime, fcm] : [realtime]),
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

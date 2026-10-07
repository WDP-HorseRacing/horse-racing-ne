import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Messaging } from 'firebase-admin/messaging';
import { FIREBASE_MESSAGING } from '../../../common/infrastructure/firebase/firebase.token';
import { RealtimeModule } from '../../realtime/realtime.module';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PUSH_QUEUE,
} from '../constants/notification.constants';
import {
  NotificationRecord,
  NotificationSchema,
} from '../schemas/notification.schema';
import { UserDevice, UserDeviceSchema } from '../schemas/user-device.schema';
import type { NotificationChannel } from '../types/notification.types';
import { GroomAssignmentChangedListener } from './groom-assignment-changed.listener';
import { HorseBarnAssignedListener } from './horse-barn-assigned.listener';
import { HorseDeceasedListener } from './horse-deceased.listener';
import { HorseOwnershipTransferredListener } from './horse-ownership-transferred.listener';
import { HorseGroomReleasedListener } from './horse-groom-released.listener';
import { HorseMeasurementAlertListener } from './horse-measurement-alert.listener';
import { HorseNotificationsService } from './horse-notifications.service';
import { MedicalEventsListener } from './medical-events.listener';
import { MedicalNotificationsService } from './medical-notifications.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { PerformanceMetricCriticalListener } from './performance-metric-critical.listener';
import { PerformanceNotificationsService } from './performance-notifications.service';
import { NotificationPushProcessor } from './notification-push.processor';
import { NotificationRecipientsRepository } from './notification-recipients.repository';
import { PushChannel } from './push.channel';
import { RealtimeChannel } from './realtime.channel';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationRecord.name, schema: NotificationSchema },
      { name: UserDevice.name, schema: UserDeviceSchema },
    ]),
    RealtimeModule,
    BullModule.registerQueue({ name: NOTIFICATION_PUSH_QUEUE }),
  ],
  providers: [
    RealtimeChannel,
    PushChannel,
    NotificationPushProcessor,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [RealtimeChannel, PushChannel, FIREBASE_MESSAGING],
      useFactory: (
        realtime: RealtimeChannel,
        push: PushChannel,
        messaging: Messaging | null,
      ): NotificationChannel[] => (messaging ? [realtime, push] : [realtime]),
    },
    NotificationDeliveryService,
    HorseNotificationsService,
    MedicalNotificationsService,
    NotificationRecipientsRepository,
    HorseMeasurementAlertListener,
    HorseBarnAssignedListener,
    HorseGroomReleasedListener,
    HorseDeceasedListener,
    HorseOwnershipTransferredListener,
    GroomAssignmentChangedListener,
    MedicalEventsListener,
    PerformanceNotificationsService,
    PerformanceMetricCriticalListener,
  ],
})
export class NotificationDeliveryModule {}

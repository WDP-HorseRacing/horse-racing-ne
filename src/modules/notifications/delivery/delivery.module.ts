import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Messaging } from 'firebase-admin/messaging';
import { FIREBASE_MESSAGING } from '../../../common/infrastructure/firebase/firebase.token';
import { RealtimeModule } from '../../realtime/realtime.module';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PUSH_CHANNEL,
  NOTIFICATION_PUSH_QUEUE,
} from '../constants/notification.constants';
import {
  NotificationRecord,
  NotificationSchema,
} from '../schemas/notification.schema';
import { UserDevice, UserDeviceSchema } from '../schemas/user-device.schema';
import type { NotificationChannel } from '../types/notification.types';
import { CareTaskChangedListener } from './care-task-changed.listener';
import { ChecklistGenerationListener } from './checklist-generation.listener';
import { ChecklistTaskAddedListener } from './checklist-task-added.listener';
import { IncidentStaleListener } from './incident-stale.listener';
import { IncidentHandledListener } from './incident-handled.listener';
import { IncidentReportedListener } from './incident-reported.listener';
import { GroomAssignmentChangedListener } from './groom-assignment-changed.listener';
import { HorseBarnAssignedListener } from './horse-barn-assigned.listener';
import { HorseDeceasedListener } from './horse-deceased.listener';
import { HorseLifecycleChangedListener } from './horse-lifecycle-changed.listener';
import { HorseOwnershipTransferredListener } from './horse-ownership-transferred.listener';
import { HorseOwnerAssignedListener } from './horse-owner-assigned.listener';
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
import { StallHorseMovedListener } from './stall-horse-moved.listener';
import { SupplyEventsListener } from './supply-events.listener';
import { SurchargeAddedListener } from './surcharge-added.listener';
import { TrainingSessionCancelledListener } from './training-session-cancelled.listener';
import { TrainingRunGroomAssignedListener } from './training-run-groom-assigned.listener';
import { SupplyNotificationsService } from './supply-notifications.service';

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
      inject: [RealtimeChannel],
      useFactory: (realtime: RealtimeChannel): NotificationChannel[] => [
        realtime,
      ],
    },
    {
      provide: NOTIFICATION_PUSH_CHANNEL,
      inject: [PushChannel, FIREBASE_MESSAGING],
      useFactory: (
        push: PushChannel,
        messaging: Messaging | null,
      ): NotificationChannel | null => (messaging ? push : null),
    },
    NotificationDeliveryService,
    HorseNotificationsService,
    MedicalNotificationsService,
    NotificationRecipientsRepository,
    HorseMeasurementAlertListener,
    HorseBarnAssignedListener,
    StallHorseMovedListener,
    HorseGroomReleasedListener,
    HorseDeceasedListener,
    HorseOwnershipTransferredListener,
    HorseOwnerAssignedListener,
    GroomAssignmentChangedListener,
    ChecklistTaskAddedListener,
    CareTaskChangedListener,
    ChecklistGenerationListener,
    IncidentReportedListener,
    IncidentHandledListener,
    HorseLifecycleChangedListener,
    SurchargeAddedListener,
    TrainingSessionCancelledListener,
    TrainingRunGroomAssignedListener,
    IncidentStaleListener,
    MedicalEventsListener,
    PerformanceNotificationsService,
    PerformanceMetricCriticalListener,
    SupplyNotificationsService,
    SupplyEventsListener,
  ],
})
export class NotificationDeliveryModule {}

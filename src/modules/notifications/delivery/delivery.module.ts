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
import { SurchargeAddedListener } from './billing/surcharge-added.listener';
import { HorseBarnAssignedListener } from './horses/horse-barn-assigned.listener';
import { HorseDeceasedListener } from './horses/horse-deceased.listener';
import { HorseGroomReleasedListener } from './horses/horse-groom-released.listener';
import { HorseLifecycleChangedListener } from './horses/horse-lifecycle-changed.listener';
import { HorseMeasurementAlertListener } from './horses/horse-measurement-alert.listener';
import { HorseOwnerAssignedListener } from './horses/horse-owner-assigned.listener';
import { HorseOwnershipTransferredListener } from './horses/horse-ownership-transferred.listener';
import { HorseNotificationsService } from './horses/horse-notifications.service';
import { MedicalEventsListener } from './medical/medical-events.listener';
import { MedicalNotificationsService } from './medical/medical-notifications.service';
import { PerformanceMetricCriticalListener } from './performance/performance-metric-critical.listener';
import { PerformanceNotificationsService } from './performance/performance-notifications.service';
import { SupplyEventsListener } from './supplies/supply-events.listener';
import { SupplyNotificationsService } from './supplies/supply-notifications.service';
import { CareTaskChangedListener } from './stable/care/care-task-changed.listener';
import { ChecklistGenerationListener } from './stable/checklists/checklist-generation.listener';
import { ChecklistTaskAddedListener } from './stable/checklists/checklist-task-added.listener';
import { GroomAssignmentChangedListener } from './stable/assignments/groom-assignment-changed.listener';
import { IncidentHandledListener } from './stable/incidents/incident-handled.listener';
import { IncidentReportedListener } from './stable/incidents/incident-reported.listener';
import { IncidentStaleListener } from './stable/incidents/incident-stale.listener';
import { StallHorseMovedListener } from './stable/assignments/stall-horse-moved.listener';
import { TrainingRunGroomAssignedListener } from './training/training-run-groom-assigned.listener';
import { TrainingSessionCancelledListener } from './training/training-session-cancelled.listener';
import { NotificationDeliveryService } from './shared/notification-delivery.service';
import { NotificationPushProcessor } from './shared/notification-push.processor';
import { NotificationRecipientsRepository } from './shared/notification-recipients.repository';
import { PushChannel } from './shared/channels/push.channel';
import { RealtimeChannel } from './shared/channels/realtime.channel';

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
    NotificationRecipientsRepository,
    HorseNotificationsService,
    HorseMeasurementAlertListener,
    HorseBarnAssignedListener,
    HorseGroomReleasedListener,
    HorseDeceasedListener,
    HorseOwnerAssignedListener,
    HorseOwnershipTransferredListener,
    HorseLifecycleChangedListener,
    MedicalNotificationsService,
    MedicalEventsListener,
    PerformanceNotificationsService,
    PerformanceMetricCriticalListener,
    SupplyNotificationsService,
    SupplyEventsListener,
    CareTaskChangedListener,
    ChecklistGenerationListener,
    ChecklistTaskAddedListener,
    GroomAssignmentChangedListener,
    IncidentReportedListener,
    IncidentHandledListener,
    IncidentStaleListener,
    StallHorseMovedListener,
    TrainingRunGroomAssignedListener,
    TrainingSessionCancelledListener,
    SurchargeAddedListener,
  ],
})
export class NotificationDeliveryModule {}

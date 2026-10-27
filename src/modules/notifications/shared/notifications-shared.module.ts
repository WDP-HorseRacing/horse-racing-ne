import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  NotificationRecord,
  NotificationSchema,
} from '../schemas/notification.schema';
import { NotificationAccessService } from './notification-access.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationRecord.name, schema: NotificationSchema },
    ]),
  ],
  providers: [NotificationAccessService],
  exports: [NotificationAccessService],
})
export class NotificationsSharedModule {}

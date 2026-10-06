import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  NotificationRecord,
  NotificationSchema,
} from '../schemas/notification.schema';
import { NotificationsSharedModule } from '../shared/notifications-shared.module';
import { NotificationInboxController } from './inbox.controller';
import { NotificationInboxService } from './inbox.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationRecord.name, schema: NotificationSchema },
    ]),
    NotificationsSharedModule,
  ],
  controllers: [NotificationInboxController],
  providers: [NotificationInboxService],
})
export class NotificationInboxModule {}

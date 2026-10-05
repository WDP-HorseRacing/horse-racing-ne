import { Module } from '@nestjs/common';
import { NotificationsSharedModule } from '../shared/notifications-shared.module';
import { UserDevicesController } from './user-devices.controller';
import { UserDevicesService } from './user-devices.service';

@Module({
  imports: [NotificationsSharedModule],
  controllers: [UserDevicesController],
  providers: [UserDevicesService],
})
export class UserDevicesModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserDevice, UserDeviceSchema } from '../schemas/user-device.schema';
import { NotificationsSharedModule } from '../shared/notifications-shared.module';
import { UserDevicesController } from './user-devices.controller';
import { UserDevicesService } from './user-devices.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserDevice.name, schema: UserDeviceSchema },
    ]),
    NotificationsSharedModule,
  ],
  controllers: [UserDevicesController],
  providers: [UserDevicesService],
})
export class UserDevicesModule {}

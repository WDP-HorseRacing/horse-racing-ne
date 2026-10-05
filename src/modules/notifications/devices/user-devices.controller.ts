import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { RegisterDeviceDto } from '../dto';
import { UserDevicesService } from './user-devices.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/devices')
export class UserDevicesController {
  constructor(private readonly devices: UserDevicesService) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Register the current device for push notifications',
    description:
      'Gọi sau khi đăng nhập và mỗi khi FCM cấp token mới. Token đang gắn với tài khoản khác sẽ chuyển sang người gọi.',
  })
  @ApiNoContentResponse()
  register(
    @CurrentUser() actor: Actor,
    @Body() body: RegisterDeviceDto,
  ): Promise<void> {
    return this.devices.register(actor, body);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unregister a device of the current user',
    description:
      'Gọi khi đăng xuất. Token không có hoặc thuộc người khác thì không đổi gì.',
  })
  @ApiNoContentResponse()
  unregister(
    @CurrentUser() actor: Actor,
    @Param('token') token: string,
  ): Promise<void> {
    return this.devices.unregister(actor, token);
  }
}

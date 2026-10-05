import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { DevicePlatform } from '../constants/device-platform.enum';

/**
 * Đăng ký thiết bị nhận push FCM cho người gọi.
 */
export class RegisterDeviceDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 4096,
    description: 'FCM registration token của app trên thiết bị',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RefreshTokenDto } from './refresh-token.dto';

/**
 * Đăng xuất: refresh token cần thu hồi, kèm token FCM của thiết bị cần gỡ nếu có.
 */
export class LogoutDto extends RefreshTokenDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 4096,
    description:
      'FCM registration token của thiết bị đang đăng xuất; gửi thì gỡ thiết bị này khỏi tài khoản',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  deviceToken?: string;
}

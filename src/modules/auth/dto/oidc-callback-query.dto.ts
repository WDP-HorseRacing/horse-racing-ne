import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class OidcCallbackQueryDto {
  @ApiProperty({
    minLength: 1,
    description: 'Authorization code Keycloak trả về sau khi đăng nhập',
  })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({
    minLength: 1,
    description: 'Giá trị state đã gửi lúc bắt đầu luồng, dùng lấy lại PKCE',
  })
  @IsString()
  @MinLength(1)
  state!: string;

  @ApiPropertyOptional({
    description:
      'Keycloak tự gắn vào redirect; khai báo để không bị chặn bởi forbidNonWhitelisted, không dùng',
  })
  @IsOptional()
  @IsString()
  session_state?: string;

  @ApiPropertyOptional({
    description:
      'Issuer (RFC 9207) Keycloak tự gắn vào redirect; khai báo để không bị chặn bởi forbidNonWhitelisted, không dùng',
  })
  @IsOptional()
  @IsString()
  iss?: string;
}

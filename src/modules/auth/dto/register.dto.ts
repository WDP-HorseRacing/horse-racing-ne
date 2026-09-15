import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

// Khong co truong `role`: role la quyen han, nguoi dang ky khong tu cap cho minh.
export class RegisterDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'CLB muon xin vao. Bo trong thi vao hang doi chung.',
  })
  @IsOptional()
  @IsUUID()
  clubId?: string;
}

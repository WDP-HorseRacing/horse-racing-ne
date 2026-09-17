import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { UserRole, UserStatus } from '../user.enums';

export class UserResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;

  @Expose()
  @ApiProperty({ format: 'email' })
  email!: string;

  @Expose()
  @ApiPropertyOptional({ enum: UserRole, nullable: true })
  role!: UserRole | null;

  @Expose()
  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;
}

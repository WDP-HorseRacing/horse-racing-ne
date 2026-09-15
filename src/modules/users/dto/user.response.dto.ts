import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../user.enums';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  clubId!: string | null;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiPropertyOptional({ enum: UserRole, nullable: true })
  role!: UserRole | null;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;
}

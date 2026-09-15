import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../users/user.enums';

export class CurrentUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'NULL khi tai khoan cho duyet ma chua chon CLB',
  })
  clubId!: string | null;

  @ApiPropertyOptional({ enum: UserRole, nullable: true })
  role!: UserRole | null;

  @ApiProperty({
    enum: UserStatus,
    description: 'PENDING thi frontend dua ve man hinh "cho duyet"',
  })
  status!: UserStatus;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ type: [String], description: 'Role theo goc nhin Keycloak' })
  roles!: string[];
}

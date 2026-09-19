import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../users/user.enums';

export class CurrentUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ enum: UserRole, nullable: true })
  role!: UserRole | null;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({
    type: [String],
    description: 'Vai trò có hiệu lực, lấy từ dữ liệu tài khoản',
  })
  roles!: string[];
}

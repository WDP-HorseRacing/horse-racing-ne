import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../users/user.enums';

export class CurrentUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({
    enum: UserRole,
    nullable: true,
    description:
      'Vai trò lưu trong tài khoản DB (users.role), chỉ để hiển thị; có thể lệch với token đến khi đăng nhập lại',
  })
  role!: UserRole | null;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({
    type: [String],
    description:
      'Vai trò có hiệu lực để phân quyền, lấy từ realm role trong access token hiện tại',
  })
  roles!: string[];
}

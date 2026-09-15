import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '../user.enums';

export class ApproveUserDto {
  @ApiProperty({ enum: UserRole, description: 'Role cap cho nguoi duoc duyet' })
  @IsEnum(UserRole)
  role!: UserRole;
}

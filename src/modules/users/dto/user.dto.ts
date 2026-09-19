import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserRole, UserStatus } from '../user.enums';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class UserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Tìm theo họ tên hoặc email' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

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

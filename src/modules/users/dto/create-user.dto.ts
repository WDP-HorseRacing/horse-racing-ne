import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export enum UserRole {
  HEAD_TRAINER = 'HEAD_TRAINER',
  VETERINARIAN = 'VETERINARIAN',
  GROOM = 'GROOM',
  HORSE_OWNER = 'HORSE_OWNER',
  CLUB_MANAGER = 'CLUB_MANAGER',
}

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

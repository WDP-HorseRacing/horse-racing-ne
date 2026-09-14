import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum RegistrationStatus {
  OWNER_APPROVED = 'OWNER_APPROVED',
  MANAGER_CONFIRMED = 'MANAGER_CONFIRMED',
  REJECTED = 'REJECTED',
}

export class UpdateRegistrationDto {
  @ApiProperty({ enum: RegistrationStatus })
  @IsEnum(RegistrationStatus)
  status!: RegistrationStatus;
}

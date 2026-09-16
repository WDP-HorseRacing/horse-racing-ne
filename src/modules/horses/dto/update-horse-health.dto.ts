import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { HorseHealthStatus } from '../constants/horse-status.enum';

export class UpdateHorseHealthDto {
  @ApiProperty({ enum: HorseHealthStatus })
  @IsEnum(HorseHealthStatus)
  healthStatus!: HorseHealthStatus;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum HorseHealthStatus {
  ELIGIBLE = 'ELIGIBLE',
  UNDER_OBSERVATION = 'UNDER_OBSERVATION',
  INJURED = 'INJURED',
  QUARANTINED = 'QUARANTINED',
}

export enum HorseLifecycleStatus {
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
  TRANSFERRED = 'TRANSFERRED',
}

export class UpdateHorseStatusDto {
  @ApiPropertyOptional({ enum: HorseHealthStatus })
  @IsOptional()
  @IsEnum(HorseHealthStatus)
  healthStatus?: HorseHealthStatus;

  @ApiPropertyOptional({ enum: HorseLifecycleStatus })
  @IsOptional()
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus?: HorseLifecycleStatus;
}

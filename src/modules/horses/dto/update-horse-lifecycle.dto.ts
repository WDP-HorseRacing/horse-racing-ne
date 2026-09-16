import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { HorseLifecycleStatus } from '../constants/horse-status.enum';

export class UpdateHorseLifecycleDto {
  @ApiProperty({ enum: HorseLifecycleStatus })
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus!: HorseLifecycleStatus;
}

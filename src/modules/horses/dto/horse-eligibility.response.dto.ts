import { ApiProperty } from '@nestjs/swagger';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { EligibilityReason } from '../domain/horse.rules';

export class HorseEligibilityResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  trainingEligible!: boolean;

  @ApiProperty()
  racingEligible!: boolean;

  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @ApiProperty({ enum: HorseLifecycleStatus })
  lifecycleStatus!: HorseLifecycleStatus;

  @ApiProperty()
  activeTrainingLock!: boolean;

  @ApiProperty({ enum: EligibilityReason, isArray: true })
  reasons!: EligibilityReason[];
}

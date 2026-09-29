import { ApiProperty } from '@nestjs/swagger';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { EligibilityReason } from '../enums/eligibility-reason.enum';

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

  @ApiProperty({
    enum: EligibilityReason,
    isArray: true,
    description: 'Lý do không được tập, rỗng khi trainingEligible = true',
  })
  trainingReasons!: EligibilityReason[];

  @ApiProperty({
    enum: EligibilityReason,
    isArray: true,
    description: 'Lý do không được đua, rỗng khi racingEligible = true',
  })
  racingReasons!: EligibilityReason[];

  @ApiProperty({
    enum: EligibilityReason,
    isArray: true,
    description: 'Mọi lý do, bằng racingReasons',
  })
  reasons!: EligibilityReason[];
}

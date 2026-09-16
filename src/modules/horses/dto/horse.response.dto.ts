import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseGender } from '../constants/horse-gender.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';
import { HorseLatestMeasurementDto } from './horse-measurement.response.dto';

export class HorseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ enum: HorseGender, nullable: true })
  gender!: HorseGender | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  breed!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  color!: string | null;

  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  raceAptitude!: RaceAptitude | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  dateOfBirth!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  microchipId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  mediaId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  sireId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  damId!: string | null;

  @ApiProperty()
  isReference!: boolean;

  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @ApiProperty({ enum: HorseLifecycleStatus })
  lifecycleStatus!: HorseLifecycleStatus;
}

export class HorseParentSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isReference!: boolean;
}

export class HorseDetailResponseDto extends HorseResponseDto {
  @ApiPropertyOptional({ type: HorseParentSummaryDto, nullable: true })
  sire!: HorseParentSummaryDto | null;

  @ApiPropertyOptional({ type: HorseParentSummaryDto, nullable: true })
  dam!: HorseParentSummaryDto | null;

  @ApiProperty({
    type: [HorseLatestMeasurementDto],
    description: 'Giá trị mới nhất của từng loại chỉ số',
  })
  latestMeasurements!: HorseLatestMeasurementDto[];

  @ApiProperty()
  activeTrainingLock!: boolean;
}

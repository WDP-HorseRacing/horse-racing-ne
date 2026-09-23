import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { HorseGender } from '../enums/horse-gender.enum';
import { HorsePlacementStatus } from '../enums/horse-placement-status.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { RaceAptitude } from '../enums/race-aptitude.enum';
import { EligibilityReason } from '../enums/eligibility-reason.enum';

export class HorseResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiPropertyOptional({ enum: HorseGender, nullable: true })
  gender!: HorseGender | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  breed!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  color!: string | null;

  @Expose()
  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  raceAptitude!: RaceAptitude | null;

  @Expose()
  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  dateOfBirth!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  microchipId!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  mediaId!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  sireId!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  damId!: string | null;

  @Expose()
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Chủ sở hữu duy nhất, null nếu chưa gán',
  })
  ownerId!: string | null;

  @Expose()
  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @Expose()
  @ApiProperty({ enum: HorseLifecycleStatus })
  lifecycleStatus!: HorseLifecycleStatus;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do của lần đổi vòng đời gần nhất',
  })
  lifecycleReason!: string | null;

  @Expose()
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Thời điểm đổi vòng đời gần nhất',
  })
  lifecycleChangedAt!: Date | null;

  @Expose()
  @ApiProperty({ description: 'Gửi lại khi PATCH /horses/{id}' })
  version!: number;
}
export class HorseBarnSummaryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Không có key khi người gọi là Horse Owner',
  })
  id?: string;

  @ApiProperty()
  name!: string;
}
export class HorseStallSummaryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Không có key khi người gọi là Horse Owner',
  })
  id?: string;

  @ApiProperty()
  code!: string;
}
export class HorseLocationDto {
  @ApiPropertyOptional({
    type: HorseBarnSummaryDto,
    nullable: true,
    description: 'Khu chuồng Club Manager đã xếp, null nếu chưa xếp khu',
  })
  barn!: HorseBarnSummaryDto | null;

  @ApiPropertyOptional({
    type: HorseStallSummaryDto,
    nullable: true,
    description: 'Ô chuồng Head Trainer đã xếp, null nếu chưa xếp ô',
  })
  stall!: HorseStallSummaryDto | null;

  @ApiProperty({ enum: HorsePlacementStatus })
  placementStatus!: HorsePlacementStatus;
}
export class HorsePersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}
export class HorseEligibilityDto {
  @ApiProperty()
  trainingEligible!: boolean;

  @ApiProperty()
  racingEligible!: boolean;

  @ApiProperty({
    enum: EligibilityReason,
    isArray: true,
    description: 'Lý do không được tập/không được đua, rỗng nếu không bị chặn',
  })
  reasons!: EligibilityReason[];
}

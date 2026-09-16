import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { HorseGender } from '../constants/horse-gender.enum';
import { HorseParentRole } from '../constants/horse-parent-role.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';
import { EligibilityReason } from '../domain/horse.rules';
import { HorseLatestMeasurementDto } from './horse-measure.dto';

export class CreateHorseDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: HorseGender })
  @IsEnum(HorseGender)
  gender!: HorseGender;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  breed?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  @IsOptional()
  @IsEnum(RaceAptitude)
  raceAptitude?: RaceAptitude | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  microchipId?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  sireId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  damId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  mediaId?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      'true cho ngựa giống bên ngoài, chỉ dùng làm tổ tiên trong phả hệ',
  })
  @IsOptional()
  @IsBoolean()
  isReference?: boolean;
}

export class UpdateHorseDto extends PartialType(
  OmitType(CreateHorseDto, ['isReference'] as const),
) {}

export class HorseListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc microchip' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ enum: HorseHealthStatus })
  @IsOptional()
  @IsEnum(HorseHealthStatus)
  healthStatus?: HorseHealthStatus;

  @ApiPropertyOptional({ enum: HorseLifecycleStatus })
  @IsOptional()
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus?: HorseLifecycleStatus;

  @ApiPropertyOptional({
    default: false,
    description: 'true để xem ngựa tham chiếu (chỉ Club Manager, Head Trainer)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  reference: boolean = false;
}

export class UpdateHorseHealthDto {
  @ApiProperty({ enum: HorseHealthStatus })
  @IsEnum(HorseHealthStatus)
  healthStatus!: HorseHealthStatus;
}

export class UpdateHorseLifecycleDto {
  @ApiProperty({ enum: HorseLifecycleStatus })
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus!: HorseLifecycleStatus;
}

export class HorseOwnerShareDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ownerId!: string;

  @ApiProperty({ minimum: 0.01, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percentage!: number;
}

export class SetHorseOwnersDto {
  @ApiProperty({ type: [HorseOwnerShareDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HorseOwnerShareDto)
  owners!: HorseOwnerShareDto[];
}

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
  @ApiProperty()
  isReference!: boolean;

  @Expose()
  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @Expose()
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

export class HorseOwnershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty()
  ownerName!: string;

  @ApiProperty()
  percentage!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  endDate!: string | null;
}

export class HorsePedigreeNodeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ enum: HorseGender, nullable: true })
  gender!: HorseGender | null;

  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  raceAptitude!: RaceAptitude | null;

  @ApiProperty()
  isReference!: boolean;

  @ApiProperty({ minimum: 1, maximum: 4 })
  generation!: number;

  @ApiProperty({ enum: HorseParentRole })
  parentRole!: HorseParentRole;

  @ApiProperty({
    format: 'uuid',
    description: 'Ngựa con của node này trong cây',
  })
  childId!: string;
}

export class HorsePedigreeResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ minimum: 1, maximum: 4 })
  depth!: number;

  @ApiProperty({ type: [HorsePedigreeNodeResponseDto] })
  ancestors!: HorsePedigreeNodeResponseDto[];
}

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

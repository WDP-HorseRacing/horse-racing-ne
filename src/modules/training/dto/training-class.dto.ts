import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RaceAptitude } from '../../horses/enums/race-aptitude.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { ClassSessionInputDto } from './class-schedule.dto';

export class CreateTrainingClassDto {
  @ApiProperty({ description: 'Mã lớp huấn luyện (ví dụ: TC-2026-01)' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ description: 'Tên lớp huấn luyện' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả lớp học' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: RaceAptitude,
    description: 'Sở trường cự ly mục tiêu (SPRINTER, MILER, STAYER)',
  })
  @IsOptional()
  @IsEnum(RaceAptitude)
  raceAptitude?: RaceAptitude;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    description: 'Sức chứa tối đa số ngựa trong lớp',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxHorses?: number;

  @ApiProperty({
    format: 'uuid',
    description: 'Giáo án của Head Trainer phụ trách lớp',
  })
  @IsUUID()
  planId!: string;

  @ApiProperty({
    format: 'date',
    description:
      'Ngày bắt đầu; ngày kết thúc tự tính theo tổng số tuần của giáo án',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    type: [ClassSessionInputDto],
    minItems: 1,
    maxItems: 500,
    description: 'Các buổi tập lấy từ xem trước lịch, đã chỉnh trên màn hình',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ClassSessionInputDto)
  sessions!: ClassSessionInputDto[];
}

export class UpdateTrainingClassDto extends PartialType(
  OmitType(CreateTrainingClassDto, ['planId', 'sessions'] as const),
) {}

export class UpdateTrainingClassStatusDto {
  @ApiProperty({ enum: TrainingClassStatus })
  @IsEnum(TrainingClassStatus)
  status!: TrainingClassStatus;

  @ApiPropertyOptional({
    minLength: 1,
    description: 'Lý do hủy class, bắt buộc khi status = CANCELLED',
  })
  @ValidateIf(
    (body: UpdateTrainingClassStatusDto) =>
      body.status === TrainingClassStatus.CANCELLED,
  )
  @IsString()
  @MinLength(1)
  cancelReason?: string;
}

export class TrainingClassResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  code!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiPropertyOptional()
  @Expose()
  description!: string | null;

  @ApiPropertyOptional({ enum: RaceAptitude })
  @Expose()
  raceAptitude!: RaceAptitude | null;

  @ApiProperty()
  @Expose()
  maxHorses!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @Expose()
  headTrainerId!: string | null;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  planId!: string;

  @ApiProperty({ format: 'date' })
  @Expose()
  startDate!: string;

  @ApiProperty({ format: 'date' })
  @Expose()
  endDate!: string;

  @ApiProperty({ enum: TrainingClassStatus })
  @Expose()
  status!: TrainingClassStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  completedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  cancelledAt!: Date | null;

  @ApiPropertyOptional()
  @Expose()
  cancelReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  updatedAt!: Date;
}

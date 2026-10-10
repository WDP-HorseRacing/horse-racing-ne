import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';

export class CreateTrainingSessionDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160, { message: 'Tên buổi tập tối đa 160 ký tự' })
  name!: string;

  @ApiPropertyOptional({ enum: TrainingSessionType })
  @IsOptional()
  @IsEnum(TrainingSessionType)
  sessionType?: TrainingSessionType;

  @ApiProperty({ format: 'uuid', description: 'Môn học của buổi' })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ enum: TrainingIntensity, description: 'Cường độ buổi tập' })
  @IsEnum(TrainingIntensity)
  intensity!: TrainingIntensity;

  @ApiProperty({
    minimum: 0,
    maximum: 20000,
    description: 'Cự ly dự kiến của buổi tập (mét)',
  })
  @IsInt()
  @Min(0)
  @Max(20000)
  plannedDistanceM!: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledStartAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledEndAt!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Địa điểm tối đa 160 ký tự' })
  location?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Mặt sân tối đa 80 ký tự' })
  surface?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    nullable: true,
    description:
      'Thời gian mục tiêu (ms), chỉ cho môn chạy thử; null là không có mục tiêu',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetTimeMs?: number | null;
}

export class UpdateTrainingSessionDto extends PartialType(
  OmitType(CreateTrainingSessionDto, [
    'location',
    'surface',
    'notes',
    'targetTimeMs',
  ] as const),
) {
  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Địa điểm tối đa 160 ký tự' })
  location?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Mặt sân tối đa 80 ký tự' })
  surface?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class PublishClassSessionsDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'Chỉ publish buổi từ ngày này (lịch CLB); bỏ trống là không giới hạn',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Chỉ publish buổi tới hết ngày này (lịch CLB); bỏ trống là không giới hạn',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CancelTrainingSessionDto {
  @ApiProperty({ minLength: 1, description: 'Lý do hủy buổi tập' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class TrainingSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  classId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Expose()
  subjectId!: string | null;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty({ enum: TrainingSessionType })
  @Expose()
  sessionType!: TrainingSessionType;

  @ApiProperty({ enum: TrainingIntensity, description: 'Cường độ buổi tập' })
  @Expose()
  intensity!: TrainingIntensity;

  @ApiProperty({ description: 'Cự ly dự kiến của buổi tập (mét)' })
  @Expose()
  plannedDistanceM!: number;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  scheduledStartAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  scheduledEndAt!: Date;

  @ApiPropertyOptional()
  @Expose()
  location!: string | null;

  @ApiPropertyOptional()
  @Expose()
  surface!: string | null;

  @ApiPropertyOptional()
  @Expose()
  notes!: string | null;

  @ApiProperty({ enum: TrainingSessionStatus })
  @Expose()
  status!: TrainingSessionStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Expose()
  cancelledBy!: string | null;

  @ApiPropertyOptional()
  @Expose()
  cancelReason!: string | null;
}

export class SkippedHorseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  horseId!: string;

  @ApiProperty()
  @Expose()
  horseName!: string;

  @ApiProperty({ description: 'Mã lớp có buổi trùng giờ' })
  @Expose()
  conflictClassCode!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Giờ bắt đầu của buổi trùng giờ',
  })
  @Expose()
  conflictStartAt!: Date;
}

export class PublishedSessionResponseDto extends TrainingSessionResponseDto {
  @ApiProperty({
    type: [SkippedHorseDto],
    description:
      'Ngựa không được tạo lượt ở buổi này vì trùng giờ với buổi ở lớp khác',
  })
  @Expose()
  @Type(() => SkippedHorseDto)
  skippedHorses!: SkippedHorseDto[];
}

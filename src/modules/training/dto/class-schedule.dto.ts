import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';

export class ClassScheduleInputDto {
  @ApiProperty({ format: 'uuid', description: 'Giáo án của Head Trainer gọi' })
  @IsUUID()
  planId!: string;

  @ApiProperty({ format: 'date', description: 'Ngày bắt đầu lớp' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    example: '06:00',
    description: 'Giờ bắt đầu theo giờ CLB (HH:mm)',
  })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({
    minimum: 15,
    maximum: 480,
    description: 'Thời lượng mỗi buổi (phút)',
  })
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;
}

export class ScheduledSessionDto {
  @ApiProperty({ description: 'Tuần thứ mấy của lớp, bắt đầu từ 1' })
  week!: number;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty({ description: 'Tên buổi, mặc định là tên môn' })
  name!: string;

  @ApiProperty({ enum: TrainingSessionType })
  sessionType!: TrainingSessionType;

  @ApiProperty({ enum: TrainingIntensity })
  intensity!: TrainingIntensity;

  @ApiProperty({ description: 'Cự ly dự kiến (mét)' })
  plannedDistanceM!: number;

  @ApiPropertyOptional({ nullable: true })
  surface!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Thời gian mục tiêu (ms) của buổi chạy thử',
  })
  targetTimeMs!: number | null;

  @ApiProperty({ format: 'date-time' })
  scheduledStartAt!: Date;

  @ApiProperty({ format: 'date-time' })
  scheduledEndAt!: Date;
}

export class ClassSchedulePreviewDto {
  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({
    format: 'date',
    description: 'Ngày kết thúc tính theo tổng số tuần của giáo án',
  })
  endDate!: string;

  @ApiProperty({ type: [ScheduledSessionDto] })
  sessions!: ScheduledSessionDto[];
}

export class ClassSessionInputDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Môn học; loại buổi lấy theo môn',
  })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160, { message: 'Tên buổi tập tối đa 160 ký tự' })
  name!: string;

  @ApiProperty({ enum: TrainingIntensity })
  @IsEnum(TrainingIntensity)
  intensity!: TrainingIntensity;

  @ApiProperty({
    minimum: 0,
    maximum: 20000,
    description: 'Cự ly dự kiến (mét)',
  })
  @IsInt()
  @Min(0)
  @Max(20000)
  plannedDistanceM!: number;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Mặt sân tối đa 80 ký tự' })
  surface?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Địa điểm tối đa 160 ký tự' })
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Thời gian mục tiêu (ms), chỉ cho môn chạy thử',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetTimeMs?: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledStartAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledEndAt!: string;
}

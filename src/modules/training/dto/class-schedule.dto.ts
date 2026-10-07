import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
    type: [Number],
    minItems: 1,
    maxItems: 7,
    description: 'Các thứ có buổi tập theo ISO: 1 là thứ Hai, 7 là Chủ nhật',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

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
  @MaxLength(160)
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
  @MaxLength(80)
  surface?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';

export class CreateTrainingSubjectDto {
  @ApiProperty({ maxLength: 160, description: 'Tên môn, duy nhất trong CLB' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả bài tập' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: TrainingSessionType,
    description: 'Buổi thường hoặc chạy thử',
  })
  @IsEnum(TrainingSessionType)
  sessionType!: TrainingSessionType;

  @ApiProperty({ enum: TrainingIntensity, description: 'Cường độ bài tập' })
  @IsEnum(TrainingIntensity)
  intensity!: TrainingIntensity;

  @ApiProperty({
    minimum: 0,
    maximum: 20000,
    description: 'Cự ly dự kiến (mét); môn chạy thử phải lớn hơn 0',
  })
  @IsInt()
  @Min(0)
  @Max(20000)
  plannedDistanceM!: number;

  @ApiPropertyOptional({ maxLength: 80, description: 'Mặt sân' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  surface?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Thời gian mục tiêu (ms), chỉ dùng cho môn chạy thử',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetTimeMs?: number;
}

export class UpdateTrainingSubjectDto extends PartialType(
  CreateTrainingSubjectDto,
) {}

export class TrainingSubjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  description!: string | null;

  @ApiProperty({ enum: TrainingSessionType })
  @Expose()
  sessionType!: TrainingSessionType;

  @ApiProperty({ enum: TrainingIntensity })
  @Expose()
  intensity!: TrainingIntensity;

  @ApiProperty({ description: 'Cự ly dự kiến (mét)' })
  @Expose()
  plannedDistanceM!: number;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  surface!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Thời gian mục tiêu (ms)',
  })
  @Expose()
  targetTimeMs!: number | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  updatedAt!: Date;
}

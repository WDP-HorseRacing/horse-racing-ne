import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';

export class CreateTrainingSessionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: TrainingSessionType })
  @IsEnum(TrainingSessionType)
  sessionType!: TrainingSessionType;

  @ApiProperty({ enum: TrainingIntensity, description: 'Cường độ buổi tập' })
  @IsEnum(TrainingIntensity)
  intensity!: TrainingIntensity;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledStartAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledEndAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  surface?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTrainingSessionDto extends PartialType(
  CreateTrainingSessionDto,
) {}

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
  planId!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty({ enum: TrainingSessionType })
  @Expose()
  sessionType!: TrainingSessionType;

  @ApiProperty({ enum: TrainingIntensity, description: 'Cường độ buổi tập' })
  @Expose()
  intensity!: TrainingIntensity;

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

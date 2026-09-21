import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';

export class CreateTrainingSessionDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  distanceKm!: number;

  @ApiProperty()
  @IsString()
  intensity!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  surface?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  plannedDurationMinutes?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groomId?: string;
}

export class UpdateTrainingSessionDto extends PartialType(
  CreateTrainingSessionDto,
) {}

export class CompleteTrainingSessionDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualDistanceKm?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualDurationSeconds?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  perceivedEffort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelTrainingSessionDto {
  @ApiProperty({ minLength: 1, description: 'Lý do hủy buổi tập' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class EvaluateSessionDto {
  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  score!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class SessionEvaluationResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  evaluatorId!: string;

  @ApiProperty()
  @Expose()
  score!: number;

  @ApiPropertyOptional()
  @Expose()
  comment!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;
}

export class TrainingSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  planId!: string;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  scheduledAt!: Date;

  @ApiProperty()
  @Expose()
  distanceKm!: string;

  @ApiPropertyOptional()
  @Expose()
  plannedDurationMinutes!: number | null;

  @ApiProperty()
  @Expose()
  intensity!: string;

  @ApiPropertyOptional()
  @Expose()
  surface!: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Expose()
  groomId!: string | null;

  @ApiProperty({ enum: TrainingSessionStatus })
  @Expose()
  status!: TrainingSessionStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  startedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  completedAt!: Date | null;

  @ApiPropertyOptional()
  @Expose()
  actualDistanceKm!: string | null;

  @ApiPropertyOptional()
  @Expose()
  actualDurationSeconds!: number | null;

  @ApiPropertyOptional()
  @Expose()
  perceivedEffort!: number | null;

  @ApiPropertyOptional()
  @Expose()
  completionNotes!: string | null;

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

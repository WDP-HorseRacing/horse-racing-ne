import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTimeTrialDto {
  @ApiProperty({ minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  distanceM!: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetTimeMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class TimeTrialResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionId!: string;

  @ApiProperty()
  @Expose()
  distanceM!: string;

  @ApiPropertyOptional()
  @Expose()
  targetTimeMs!: string | null;

  @ApiPropertyOptional()
  @Expose()
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;
}

export class CreateTrialResultDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  attemptNo!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  elapsedMs!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  videoMediaId?: string;
}

export class TrialResultResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  timeTrialId!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionParticipantId!: string;

  @ApiProperty()
  @Expose()
  attemptNo!: number;

  @ApiProperty()
  @Expose()
  elapsedMs!: string;

  @ApiPropertyOptional()
  @Expose()
  notes!: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Expose()
  videoMediaId!: string | null;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  recordedBy!: string;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  recordedAt!: Date;
}

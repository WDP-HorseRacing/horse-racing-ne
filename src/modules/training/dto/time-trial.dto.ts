import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateTimeTrialDto {
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  distanceMeters!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  durationSeconds!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  videoAssetId?: string;

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
  distanceMeters!: string;

  @ApiProperty()
  @Expose()
  durationSeconds!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Expose()
  videoAssetId!: string | null;

  @ApiPropertyOptional()
  @Expose()
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

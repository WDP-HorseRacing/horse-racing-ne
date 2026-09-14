import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groomId?: string;
}

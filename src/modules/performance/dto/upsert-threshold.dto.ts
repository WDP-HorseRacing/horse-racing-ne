import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpsertThresholdDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  profileName!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  @IsObject()
  limits!: Record<string, number>;
}

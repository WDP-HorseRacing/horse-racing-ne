import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class IngestMetricDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sourceId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  recordedAt!: string;

  @ApiProperty({ minimum: 0, maximum: 300 })
  @IsInt()
  @Min(0)
  @Max(300)
  heartRateBpm!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  speedMps!: number;
}

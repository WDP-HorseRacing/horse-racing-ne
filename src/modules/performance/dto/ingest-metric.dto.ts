import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { IsIsoInstant } from '../../../common/utils/dto-input';

export class IngestMetricDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sourceId!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-23T00:30:00+07:00',
  })
  @IsIsoInstant()
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

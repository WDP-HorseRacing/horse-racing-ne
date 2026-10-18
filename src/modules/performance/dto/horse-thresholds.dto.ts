import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class ThresholdLimitsDto {
  @ApiProperty({ description: 'Nhịp tim vượt mức này là WARNING' })
  @Expose()
  heartRateWarningBpm!: number;

  @ApiProperty({ description: 'Nhịp tim vượt mức này là CRITICAL' })
  @Expose()
  heartRateCriticalBpm!: number;

  @ApiProperty({ description: 'Tốc độ (m/s) vượt mức này là WARNING' })
  @Expose()
  maxSpeedMps!: number;
}

export class HorseThresholdsResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  horseId!: string;

  @ApiProperty({
    type: ThresholdLimitsDto,
    description: 'Ngưỡng chung của CLB dùng để chấm mức điểm đo',
  })
  @Expose()
  @Type(() => ThresholdLimitsDto)
  limits!: ThresholdLimitsDto;
}

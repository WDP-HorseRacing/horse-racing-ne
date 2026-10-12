import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { MAX_PLAUSIBLE_SPEED_MPS } from '../constants/performance.constants';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import { IngestMetricDto } from './ingest-metric.dto';

export class IngestMetricBatchDto {
  @ApiProperty({ type: [IngestMetricDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngestMetricDto)
  metrics!: IngestMetricDto[];
}

export class IngestMetricsResultDto {
  @ApiProperty({ description: 'Số điểm đo đã lưu' })
  accepted!: number;

  @ApiProperty({
    description: 'Số điểm đo bỏ qua vì trùng cảm biến và thời điểm đo',
  })
  skippedDuplicates!: number;

  @ApiProperty({
    description: `Số điểm đo bỏ qua vì không hợp lệ: tốc độ quá ${MAX_PLAUSIBLE_SPEED_MPS} m/s hoặc thời điểm đo ngoài lượt tập`,
  })
  skippedInvalid!: number;

  @ApiProperty({
    enum: MetricAlertLevel,
    description: 'Mức cảnh báo cao nhất trong các điểm đo đã lưu',
  })
  highestAlertLevel!: MetricAlertLevel;
}

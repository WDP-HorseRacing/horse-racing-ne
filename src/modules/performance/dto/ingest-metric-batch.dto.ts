import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
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
    enum: MetricAlertLevel,
    description: 'Mức cảnh báo cao nhất trong các điểm đo đã lưu',
  })
  highestAlertLevel!: MetricAlertLevel;
}

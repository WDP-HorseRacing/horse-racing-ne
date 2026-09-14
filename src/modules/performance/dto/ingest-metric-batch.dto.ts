import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { IngestMetricDto } from './ingest-metric.dto';

export class IngestMetricBatchDto {
  @ApiProperty({ type: [IngestMetricDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IngestMetricDto)
  metrics!: IngestMetricDto[];
}

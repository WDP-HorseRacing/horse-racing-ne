import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PerformanceMetricPointDto {
  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;

  @ApiProperty()
  heartRateBpm!: number;

  @ApiProperty()
  speedMps!: string;

  @ApiProperty()
  alertLevel!: string;
}

export class PerformanceEvaluationDto {
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty()
  score!: number;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;
}

export class HorsePerformanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  sessionsTracked!: number;

  @ApiPropertyOptional({ type: PerformanceMetricPointDto, nullable: true })
  latestMetric!: PerformanceMetricPointDto | null;

  @ApiProperty({ type: [PerformanceMetricPointDto] })
  recentMetrics!: PerformanceMetricPointDto[];

  @ApiPropertyOptional({ type: PerformanceEvaluationDto, nullable: true })
  latestEvaluation!: PerformanceEvaluationDto | null;
}

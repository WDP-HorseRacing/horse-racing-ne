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

export class SessionPerformanceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ format: 'date-time' })
  scheduledAt!: Date;

  @ApiProperty({ description: 'Nhịp tim trung bình trong buổi (bpm)' })
  avgHeartRateBpm!: number;

  @ApiProperty({ description: 'Nhịp tim cao nhất trong buổi (bpm)' })
  maxHeartRateBpm!: number;

  @ApiProperty({ description: 'Tốc độ trung bình trong buổi (m/s)' })
  avgSpeedMps!: string;

  @ApiProperty({ description: 'Tốc độ cao nhất trong buổi (m/s)' })
  maxSpeedMps!: string;

  @ApiProperty({ description: 'Số điểm đo có alertLevel khác NORMAL' })
  alertCount!: number;
}

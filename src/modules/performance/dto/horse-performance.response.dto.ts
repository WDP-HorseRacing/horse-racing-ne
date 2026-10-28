import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';

export class PerformanceMetricPointDto {
  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;

  @ApiProperty()
  heartRateBpm!: number;

  @ApiProperty({ type: Number })
  speedMps!: number;

  @ApiProperty({ enum: MetricAlertLevel })
  alertLevel!: MetricAlertLevel;
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

  @ApiProperty({
    type: Number,
    description: 'Tốc độ trung bình trong buổi (m/s)',
  })
  avgSpeedMps!: number;

  @ApiProperty({
    type: Number,
    description: 'Tốc độ cao nhất trong buổi (m/s)',
  })
  maxSpeedMps!: number;

  @ApiProperty({ description: 'Số điểm đo có alertLevel khác NORMAL' })
  alertCount!: number;
}

export class ParticipantPerformanceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  sessionParticipantId!: string;

  @ApiProperty({ description: 'Số điểm đo của lượt tập' })
  count!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nhịp tim trung bình (bpm), null khi chưa có điểm đo',
  })
  avgHeartRateBpm!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nhịp tim cao nhất (bpm), null khi chưa có điểm đo',
  })
  maxHeartRateBpm!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Tốc độ trung bình (m/s), null khi chưa có điểm đo',
  })
  avgSpeedMps!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Tốc độ cao nhất (m/s), null khi chưa có điểm đo',
  })
  maxSpeedMps!: number | null;

  @ApiProperty({ description: 'Số điểm đo mức WARNING' })
  warningCount!: number;

  @ApiProperty({ description: 'Số điểm đo mức CRITICAL' })
  criticalCount!: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  firstRecordedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastRecordedAt!: Date | null;
}

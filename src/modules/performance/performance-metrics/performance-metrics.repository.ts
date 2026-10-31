import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { PARTICIPANT_METRIC_LIMIT } from '../constants/performance.constants';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import { metricIdentity } from '../policies/performance.policy';
import { PerformanceMetric } from '../schemas/performance-metric.schema';
import type {
  ClassifiedMetric,
  ParticipantMetricAggregate,
} from '../types/performance.types';

interface ParticipantMetricGroup {
  count: number;
  sumHeartRateBpm: number;
  maxHeartRateBpm: number;
  sumSpeedMps: Types.Decimal128;
  maxSpeedMps: Types.Decimal128;
  warningCount: number;
  criticalCount: number;
  firstRecordedAt: Date;
  lastRecordedAt: Date;
}

/** Các truy vấn lưu và tổng hợp điểm đo trong MongoDB. */
@Injectable()
export class PerformanceMetricsRepository {
  constructor(
    @InjectModel(PerformanceMetric.name)
    private readonly metrics: Model<PerformanceMetric>,
  ) {}

  /** Trả lại những điểm chưa tồn tại theo cặp lượt tập, cảm biến và thời điểm. */
  async findUnstored(
    participantId: string,
    points: ClassifiedMetric[],
  ): Promise<ClassifiedMetric[]> {
    if (points.length === 0) return [];

    const stored = await this.metrics
      .find(
        {
          'meta.sessionParticipantId': participantId,
          recordedAt: { $in: points.map((point) => point.recordedAt) },
        },
        { recordedAt: 1, 'meta.sourceId': 1 },
      )
      .lean<Array<{ recordedAt: Date; meta: { sourceId: string } }>>();
    const storedKeys = new Set(
      stored.map((row) => metricIdentity(row.meta.sourceId, row.recordedAt)),
    );

    return points.filter(
      (point) =>
        !storedKeys.has(metricIdentity(point.sourceId, point.recordedAt)),
    );
  }

  /** Lưu các điểm mới cùng thông tin lượt tập sở hữu chúng. */
  async insertForParticipant(
    participant: { id: string; horseId: string; sessionId: string },
    points: ClassifiedMetric[],
  ): Promise<void> {
    if (points.length === 0) return;

    await this.metrics.insertMany(
      points.map((point) => ({
        recordedAt: point.recordedAt,
        meta: {
          horseId: participant.horseId,
          sessionParticipantId: participant.id,
          sessionId: participant.sessionId,
          sourceId: point.sourceId,
        },
        heartRateBpm: point.heartRateBpm,
        speedMps: Types.Decimal128.fromString(point.speedMps),
        alertLevel: point.alertLevel,
      })),
    );
  }

  /** Lấy tối đa số điểm gần nhất, sắp xếp từ cũ tới mới để dựng biểu đồ. */
  async listForParticipant(participantId: string): Promise<PerformanceMetric[]> {
    const rows = await this.metrics
      .find({ 'meta.sessionParticipantId': participantId })
      .sort({ recordedAt: -1 })
      .limit(PARTICIPANT_METRIC_LIMIT)
      .lean<PerformanceMetric[]>()
      .exec();

    return rows.reverse();
  }

  /** Tổng hợp trung bình, cực đại, cảnh báo và mốc thời gian của lượt tập. */
  async summarizeParticipant(
    participantId: string,
  ): Promise<ParticipantMetricAggregate | null> {
    const [group] = await this.metrics.aggregate<ParticipantMetricGroup>([
      { $match: { 'meta.sessionParticipantId': participantId } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          sumHeartRateBpm: { $sum: '$heartRateBpm' },
          maxHeartRateBpm: { $max: '$heartRateBpm' },
          sumSpeedMps: { $sum: '$speedMps' },
          maxSpeedMps: { $max: '$speedMps' },
          warningCount: {
            $sum: {
              $cond: [{ $eq: ['$alertLevel', MetricAlertLevel.WARNING] }, 1, 0],
            },
          },
          criticalCount: {
            $sum: {
              $cond: [
                { $eq: ['$alertLevel', MetricAlertLevel.CRITICAL] },
                1,
                0,
              ],
            },
          },
          firstRecordedAt: { $min: '$recordedAt' },
          lastRecordedAt: { $max: '$recordedAt' },
        },
      },
    ]);

    if (!group) return null;

    return {
      ...group,
      sumSpeedMps: group.sumSpeedMps.toString(),
      maxSpeedMps: group.maxSpeedMps.toString(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import type { Model, Types } from 'mongoose';
import { DataSource, In, Repository } from 'typeorm';
import { TrainingSessionEntity } from '../../training/entities/training-session.entity';
import {
  NORMAL_ALERT_LEVEL,
  PERFORMANCE_SESSION_LIMIT,
  RECENT_METRIC_LIMIT,
} from '../constants/performance.constants';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceMetric } from '../schemas/performance-metric.schema';
import type { SessionMetricAggregate } from '../types/performance.types';

/**
 * Một nhóm điểm đo theo lượt tập, kết quả `$group` trong Mongo.
 */
interface ParticipantMetricGroup {
  _id: { sessionParticipantId: string; sessionId: string };
  count: number;
  sumHeartRateBpm: number;
  maxHeartRateBpm: number;
  sumSpeedMps: Types.Decimal128;
  maxSpeedMps: Types.Decimal128;
  alertCount: number;
}

@Injectable()
export class PerformanceSummariesRepository {
  constructor(
    @InjectModel(PerformanceMetric.name)
    private readonly metrics: Model<PerformanceMetric>,
    @InjectRepository(PerformanceEvaluationEntity)
    private readonly evaluations: Repository<PerformanceEvaluationEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy các điểm đo gần nhất của con ngựa, mới nhất trước
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về tối đa RECENT_METRIC_LIMIT điểm đo
   */
  listMetrics(horseId: string): Promise<PerformanceMetric[]> {
    return this.metrics
      .find({ 'meta.horseId': horseId })
      .sort({ recordedAt: -1 })
      .limit(RECENT_METRIC_LIMIT)
      .lean<PerformanceMetric[]>()
      .exec();
  }

  listEvaluations(horseId: string): Promise<PerformanceEvaluationEntity[]> {
    return this.evaluations.find({
      where: { sessionParticipant: { horseId } },
      relations: { sessionParticipant: { session: true } },
      order: { createdAt: 'DESC' },
      take: 1,
    });
  }

  /**
   * Gom chỉ số theo từng lượt tập của con ngựa, buổi mới nhất đứng đầu
   *
   * - Tổng và giá trị cao nhất của nhịp tim, tốc độ; số điểm đo có mức cảnh báo khác NORMAL_ALERT_LEVEL
   * - Giờ của buổi tập lấy từ training_sessions; thứ tự theo giờ bắt đầu dự kiến
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về mỗi lượt tập có điểm đo một dòng, tối đa PERFORMANCE_SESSION_LIMIT dòng
   */
  async sessionSummaries(horseId: string): Promise<SessionMetricAggregate[]> {
    const groups = await this.metrics.aggregate<ParticipantMetricGroup>([
      { $match: { 'meta.horseId': horseId } },
      {
        $group: {
          _id: {
            sessionParticipantId: '$meta.sessionParticipantId',
            sessionId: '$meta.sessionId',
          },
          count: { $sum: 1 },
          sumHeartRateBpm: { $sum: '$heartRateBpm' },
          maxHeartRateBpm: { $max: '$heartRateBpm' },
          sumSpeedMps: { $sum: '$speedMps' },
          maxSpeedMps: { $max: '$speedMps' },
          alertCount: {
            $sum: {
              $cond: [{ $ne: ['$alertLevel', NORMAL_ALERT_LEVEL] }, 1, 0],
            },
          },
        },
      },
    ]);
    if (groups.length === 0) {
      return [];
    }

    const sessions = await this.dataSource.manager.find(TrainingSessionEntity, {
      where: { id: In(groups.map((group) => group._id.sessionId)) },
      select: { id: true, scheduledStartAt: true },
    });
    const scheduledAtBySessionId = new Map(
      sessions.map((session) => [session.id, session.scheduledStartAt]),
    );

    return groups
      .filter((group) => scheduledAtBySessionId.has(group._id.sessionId))
      .map((group) => ({
        sessionParticipantId: group._id.sessionParticipantId,
        sessionId: group._id.sessionId,
        scheduledAt: scheduledAtBySessionId.get(group._id.sessionId)!,
        count: group.count,
        sumHeartRateBpm: group.sumHeartRateBpm,
        maxHeartRateBpm: group.maxHeartRateBpm,
        sumSpeedMps: group.sumSpeedMps.toString(),
        maxSpeedMps: group.maxSpeedMps.toString(),
        alertCount: group.alertCount,
      }))
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
      .slice(0, PERFORMANCE_SESSION_LIMIT);
  }
}

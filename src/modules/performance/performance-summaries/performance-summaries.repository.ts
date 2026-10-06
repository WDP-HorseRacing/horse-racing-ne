import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import type { Model, Types } from 'mongoose';
import { DataSource, In, Repository } from 'typeorm';
import { TrainingSessionEntity } from '../../training/entities/training-session.entity';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceMetric } from '../schemas/performance-metric.schema';
import type {
  PerformanceMetricPoint,
  SessionPerformanceRow,
} from '../types/performance.types';
import { roundedAverage, toFixedDecimal } from '../utils/decimal';

/**
 * Mức cảnh báo của điểm đo bình thường (không phát cảnh báo).
 */
const NORMAL_ALERT_LEVEL = 'NORMAL';

/**
 * Số buổi tập tối đa trả về khi tổng hợp theo buổi, lấy theo mức 100 điểm đo của API tổng quan.
 */
const PERFORMANCE_SESSION_LIMIT = 100;

/**
 * Số điểm đo thô tối đa trả về cho tổng quan của ngựa.
 */
const RECENT_METRIC_LIMIT = 100;

/**
 * Số chữ số thập phân của tốc độ (m/s).
 */
const SPEED_SCALE = 3;

/**
 * Một nhóm điểm đo theo lượt tập, kết quả `$group` trong Mongo.
 */
interface ParticipantMetricGroup {
  _id: { sessionParticipantId: string; sessionId: string };
  count: number;
  heartRateSum: number;
  heartRateMax: number;
  speedSum: Types.Decimal128;
  speedMax: Types.Decimal128;
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
  async listMetrics(horseId: string): Promise<PerformanceMetricPoint[]> {
    const rows = await this.metrics
      .find({ 'series.horseId': horseId })
      .sort({ recordedAt: -1 })
      .limit(RECENT_METRIC_LIMIT)
      .lean<PerformanceMetric[]>();
    return rows.map((row) => ({
      sessionParticipantId: row.series.sessionParticipantId,
      recordedAt: row.recordedAt,
      heartRateBpm: row.heartRateBpm,
      speedMps: toFixedDecimal(row.speedMps.toString(), SPEED_SCALE),
      alertLevel: row.alertLevel,
    }));
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
   * Tổng hợp chỉ số theo từng buổi tập của con ngựa, buổi mới nhất đứng đầu.
   *
   * - Nhịp tim trung bình (làm tròn tới số nguyên), cao nhất.
   * - Tốc độ trung bình (làm tròn 3 chữ số thập phân), cao nhất.
   * - Số điểm đo có mức cảnh báo khác NORMAL.
   * - Làm tròn nửa xa số 0; thứ tự theo giờ bắt đầu dự kiến của buổi tập.
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về mỗi buổi có điểm đo một dòng, tối đa PERFORMANCE_SESSION_LIMIT buổi
   */
  async sessionSummaries(horseId: string): Promise<SessionPerformanceRow[]> {
    const groups = await this.metrics.aggregate<ParticipantMetricGroup>([
      { $match: { 'series.horseId': horseId } },
      {
        $group: {
          _id: {
            sessionParticipantId: '$series.sessionParticipantId',
            sessionId: '$series.sessionId',
          },
          count: { $sum: 1 },
          heartRateSum: { $sum: '$heartRateBpm' },
          heartRateMax: { $max: '$heartRateBpm' },
          speedSum: { $sum: '$speedMps' },
          speedMax: { $max: '$speedMps' },
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
    const scheduledAt = new Map(
      sessions.map((session) => [session.id, session.scheduledStartAt]),
    );

    return groups
      .filter((group) => scheduledAt.has(group._id.sessionId))
      .map((group) => ({
        sessionParticipantId: group._id.sessionParticipantId,
        sessionId: group._id.sessionId,
        scheduledAt: scheduledAt.get(group._id.sessionId)!,
        avgHeartRateBpm: Number(
          roundedAverage(String(group.heartRateSum), group.count, 0),
        ),
        maxHeartRateBpm: group.heartRateMax,
        avgSpeedMps: roundedAverage(
          group.speedSum.toString(),
          group.count,
          SPEED_SCALE,
        ),
        maxSpeedMps: toFixedDecimal(group.speedMax.toString(), SPEED_SCALE),
        alertCount: group.alertCount,
      }))
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
      .slice(0, PERFORMANCE_SESSION_LIMIT);
  }
}

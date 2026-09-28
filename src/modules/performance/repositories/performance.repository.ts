import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SessionPerformanceRow } from '../types/performance.types';
import { PerformanceMetricEntity } from '../entities/performance-metric.entity';

/**
 * Mức cảnh báo của điểm đo bình thường (không phát cảnh báo).
 */
const NORMAL_ALERT_LEVEL = 'NORMAL';

/**
 * Số buổi tập tối đa trả về khi tổng hợp theo buổi, lấy theo mức 100 điểm đo của API tổng quan.
 */
const PERFORMANCE_SESSION_LIMIT = 100;

@Injectable()
export class PerformanceRepository {
  constructor(
    @InjectRepository(PerformanceMetricEntity)
    private readonly metrics: Repository<PerformanceMetricEntity>,
  ) {}

  listMetrics(horseId: string): Promise<PerformanceMetricEntity[]> {
    return this.metrics
      .createQueryBuilder('metric')
      .innerJoinAndSelect('metric.sessionParticipant', 'participant')
      .where('participant.horse_id = :horseId', { horseId })
      .orderBy('metric.recorded_at', 'DESC')
      .take(100)
      .getMany();
  }

  /**
   * Tổng hợp chỉ số theo từng buổi tập của con ngựa, buổi mới nhất đứng đầu.
   *
   * - Nhịp tim trung bình, cao nhất.
   * - Tốc độ trung bình, cao nhất.
   * - Số điểm đo có mức cảnh báo khác NORMAL.
   *
   * @param horseId UUID của ngựa
   * @returns Mỗi buổi có điểm đo một dòng, tối đa PERFORMANCE_SESSION_LIMIT buổi
   */
  sessionSummaries(horseId: string): Promise<SessionPerformanceRow[]> {
    return this.metrics.query(
      `SELECT s.id AS "sessionId",
              s.scheduled_start_at AS "scheduledAt",
              ROUND(AVG(m.heart_rate_bpm))::int AS "avgHeartRateBpm",
              MAX(m.heart_rate_bpm)::int AS "maxHeartRateBpm",
              ROUND(AVG(m.speed_mps), 3)::text AS "avgSpeedMps",
              MAX(m.speed_mps)::text AS "maxSpeedMps",
              (COUNT(*) FILTER (WHERE m.alert_level <> $2))::int AS "alertCount"
         FROM performance_metrics m
         JOIN session_participants sp ON sp.id = m.session_participant_id
         JOIN training_sessions s ON s.id = sp.session_id
        WHERE sp.horse_id = $1
        GROUP BY s.id, s.scheduled_start_at
        ORDER BY s.scheduled_start_at DESC
        LIMIT $3`,
      [horseId, NORMAL_ALERT_LEVEL, PERFORMANCE_SESSION_LIMIT],
    );
  }
}

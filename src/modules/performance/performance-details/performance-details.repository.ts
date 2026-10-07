import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DataSource, In } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import { TrainingSessionEntity } from '../../training/entities/training-session.entity';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import { PerformanceMetric } from '../schemas/performance-metric.schema';
import type { CompletedParticipantLoad } from '../types/performance.types';

/**
 * Khoảng tối đa (giây) giữa hai điểm đo liên tiếp được tính vào cự ly; khoảng dài hơn coi như cảm biến mất tín hiệu
 */
const MAX_GAP_SECONDS = 5;

/**
 * Các câu đọc tổng hợp cho chi tiết hiệu suất của ngựa (Postgres + MongoDB)
 */
@Injectable()
export class PerformanceDetailsRepository {
  constructor(
    @InjectModel(PerformanceMetric.name)
    private readonly metrics: Model<PerformanceMetric>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy các lượt tập đã hoàn thành của ngựa có buổi bắt đầu trong khoảng ngày theo lịch CLB
   *
   * @param horseId UUID của ngựa
   * @param from Từ ngày dạng YYYY-MM-DD
   * @param to Tới ngày dạng YYYY-MM-DD
   * @returns Promise trả về mỗi lượt một dòng: cường độ, cự ly dự kiến của buổi và số giây thực tập
   */
  async completedLoads(
    horseId: string,
    from: string,
    to: string,
  ): Promise<CompletedParticipantLoad[]> {
    const rows = await this.dataSource.query<
      Array<{
        participantId: string;
        intensity: CompletedParticipantLoad['intensity'];
        plannedDistanceM: number;
        durationSeconds: string | null;
      }>
    >(
      `SELECT p.id AS "participantId",
              s.intensity AS "intensity",
              s.planned_distance_m AS "plannedDistanceM",
              EXTRACT(EPOCH FROM (p.completed_at - p.started_at)) AS "durationSeconds"
         FROM session_participants p
         JOIN training_sessions s ON s.id = p.session_id
        WHERE p.horse_id = $1
          AND p.status = $2
          AND (s.scheduled_start_at AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date`,
      [horseId, SessionParticipantStatus.COMPLETED, CLUB_TIME_ZONE, from, to],
    );
    return rows.map((row) => ({
      ...row,
      durationSeconds: Math.round(Number(row.durationSeconds ?? 0)),
    }));
  }

  /**
   * Tính tổng cự ly thực của các lượt tập từ điểm đo tốc độ
   *
   * - Mỗi điểm đóng góp tốc độ × số giây kể từ điểm trước của cùng lượt và cùng cảm biến
   * - Khoảng giữa hai điểm tối đa MAX_GAP_SECONDS giây; điểm đầu tiên không đóng góp
   *
   * @param participantIds UUID các lượt tập
   * @returns Promise trả về tổng cự ly (mét), 0 nếu không có điểm đo
   */
  async actualDistanceM(participantIds: string[]): Promise<number> {
    if (participantIds.length === 0) return 0;
    const [row] = await this.metrics.aggregate<{ distance: number }>([
      { $match: { 'meta.sessionParticipantId': { $in: participantIds } } },
      {
        $setWindowFields: {
          partitionBy: {
            participant: '$meta.sessionParticipantId',
            source: '$meta.sourceId',
          },
          sortBy: { recordedAt: 1 },
          output: {
            previousAt: { $shift: { output: '$recordedAt', by: -1 } },
          },
        },
      },
      {
        $group: {
          _id: null,
          distance: {
            $sum: {
              $cond: [
                { $eq: ['$previousAt', null] },
                0,
                {
                  $multiply: [
                    { $toDouble: '$speedMps' },
                    {
                      $min: [
                        {
                          $divide: [
                            { $subtract: ['$recordedAt', '$previousAt'] },
                            1000,
                          ],
                        },
                        MAX_GAP_SECONDS,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    ]);
    return Math.round(row?.distance ?? 0);
  }

  /**
   * Lấy một trang điểm đo có cảnh báo của ngựa, mới nhất trước
   *
   * @param horseId UUID của ngựa
   * @param levels Các mức cảnh báo cần lấy
   * @param since Từ thời điểm (bao gồm), null nếu không giới hạn
   * @param before Tới trước thời điểm (không bao gồm), null nếu không giới hạn
   * @param skip Số điểm bỏ qua
   * @param limit Số điểm tối đa của trang
   * @returns Promise trả về các điểm đo của trang và tổng số điểm khớp
   */
  async alerts(
    horseId: string,
    levels: MetricAlertLevel[],
    since: Date | null,
    before: Date | null,
    skip: number,
    limit: number,
  ): Promise<{ rows: PerformanceMetric[]; total: number }> {
    const recordedAt: Record<string, Date> = {};
    if (since) recordedAt.$gte = since;
    if (before) recordedAt.$lt = before;
    const filter = {
      'meta.horseId': horseId,
      alertLevel: { $in: levels },
      ...(since || before ? { recordedAt } : {}),
    };
    const [rows, total] = await Promise.all([
      this.metrics
        .find(filter)
        .sort({ recordedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<PerformanceMetric[]>()
        .exec(),
      this.metrics.countDocuments(filter),
    ]);
    return { rows, total };
  }

  /**
   * Lấy tên các buổi tập theo id
   *
   * @param sessionIds UUID các buổi tập
   * @returns Promise trả về map id buổi → tên buổi
   */
  async sessionNames(sessionIds: string[]): Promise<Map<string, string>> {
    if (sessionIds.length === 0) return new Map();
    const sessions = await this.dataSource.manager.find(TrainingSessionEntity, {
      select: { id: true, name: true },
      where: { id: In(sessionIds) },
    });
    return new Map(sessions.map((session) => [session.id, session.name]));
  }
}

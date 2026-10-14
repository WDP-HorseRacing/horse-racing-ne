import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { TrainingSessionStatus } from '../../training/enums/training-session-status.enum';
import type {
  DashboardHorseFilter,
  DashboardHorseRow,
  DashboardParticipantCountRow,
  ReportPeriod,
} from '../types/report.types';

/**
 * Truy vấn tổng hợp cho dashboard: ngựa trong phạm vi và số lượt tập
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lấy các ngựa đang hoạt động trong phạm vi, kèm khu, trạng thái sức khỏe, cờ khóa huấn luyện và cân nặng gần nhất
   *
   * - Bỏ hồ sơ đã xóa và số đo đã xóa
   * - headTrainerId: chỉ ngựa thuộc khu chưa xóa do Head Trainer đó phụ trách
   *
   * @param filter Một khu, hoặc các khu của một Head Trainer; bỏ trống là toàn CLB
   * @returns Promise trả về các ngựa, sắp theo tên
   */
  horses(filter: DashboardHorseFilter): Promise<DashboardHorseRow[]> {
    const params: unknown[] = [
      HorseLifecycleStatus.ACTIVE,
      TrainingLockStatus.ACTIVE,
      HorseMeasurementType.WEIGHT,
    ];
    const conditions: string[] = [];
    if (filter.barnId) {
      params.push(filter.barnId);
      conditions.push(`AND h.barn_id = $${params.length}`);
    }
    if (filter.headTrainerId) {
      params.push(filter.headTrainerId);
      conditions.push(
        `AND b.head_trainer_id = $${params.length} AND b.deleted_at IS NULL`,
      );
    }
    return this.dataSource.query(
      `SELECT h.id AS "horseId",
              h.name AS "horseName",
              h.barn_id AS "barnId",
              b.name AS "barnName",
              h.health_status AS "healthStatus",
              EXISTS (
                SELECT 1 FROM training_locks l
                 WHERE l.horse_id = h.id AND l.status = $2
              ) AS "trainingLocked",
              (SELECT m.value::text FROM horse_measurements m
                WHERE m.horse_id = h.id AND m.type = $3 AND m.deleted_at IS NULL
                ORDER BY m.measured_at DESC, m.id DESC
                LIMIT 1) AS "latestWeightKg"
         FROM horses h
         LEFT JOIN barns b ON b.id = h.barn_id
        WHERE h.deleted_at IS NULL
          AND h.lifecycle_status = $1
          ${conditions.join(' ')}
        ORDER BY h.name, h.id`,
      params,
    );
  }

  /**
   * Đếm lượt tập của các ngựa trong kỳ theo ngựa, trạng thái lượt, cường độ buổi và tuần
   *
   * - Lượt thuộc buổi có giờ bắt đầu trong kỳ
   * - Tuần tính theo lịch CLB, bắt đầu thứ Hai
   *
   * @param horseIds UUID các ngựa
   * @param period Khoảng ngày của báo cáo
   * @returns Promise trả về số lượt theo từng nhóm; danh sách ngựa rỗng thì trả mảng rỗng
   */
  async participantCounts(
    horseIds: string[],
    period: ReportPeriod,
  ): Promise<DashboardParticipantCountRow[]> {
    if (horseIds.length === 0) return [];
    return this.dataSource.query(
      `SELECT p.horse_id AS "horseId",
              p.status,
              s.intensity,
              to_char(date_trunc('week', s.scheduled_start_at AT TIME ZONE $4), 'YYYY-MM-DD') AS "weekStart",
              COUNT(*)::int AS count
         FROM session_participants p
         JOIN training_sessions s ON s.id = p.session_id
        WHERE p.horse_id = ANY($1::uuid[])
          AND s.scheduled_start_at >= $2
          AND s.scheduled_start_at < $3
        GROUP BY 1, 2, 3, 4`,
      [horseIds, period.start, period.end, CLUB_TIME_ZONE],
    );
  }

  /**
   * Đếm số buổi đang diễn ra hoặc đã xong trong kỳ có ít nhất một lượt của các ngựa
   *
   * @param horseIds UUID các ngựa
   * @param period Khoảng ngày của báo cáo
   * @returns Promise trả về số buổi; danh sách ngựa rỗng thì trả 0
   */
  async sessionCount(
    horseIds: string[],
    period: ReportPeriod,
  ): Promise<number> {
    if (horseIds.length === 0) return 0;
    const [row] = await this.dataSource.query<Array<{ count: number }>>(
      `SELECT COUNT(DISTINCT s.id)::int AS count
         FROM training_sessions s
         JOIN session_participants p ON p.session_id = s.id
        WHERE p.horse_id = ANY($1::uuid[])
          AND s.status IN ($4, $5)
          AND s.scheduled_start_at >= $2
          AND s.scheduled_start_at < $3`,
      [
        horseIds,
        period.start,
        period.end,
        TrainingSessionStatus.IN_PROGRESS,
        TrainingSessionStatus.COMPLETED,
      ],
    );
    return row.count;
  }
}

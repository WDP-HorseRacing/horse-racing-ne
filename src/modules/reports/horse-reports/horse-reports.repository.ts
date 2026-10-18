import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import type {
  HorseHealthRows,
  HorseProgressRow,
  ReportPeriod,
} from '../types/report.types';

/**
 * Truy vấn tổng hợp cho báo cáo tiến độ và sức khỏe của một con ngựa
 */
@Injectable()
export class HorseReportsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lấy các lượt tập của ngựa trong kỳ, kèm buổi, đánh giá và thời gian chạy thử tốt nhất
   *
   * - Lượt thuộc buổi có giờ bắt đầu trong kỳ, sắp theo giờ buổi
   * - Thời gian tập tính từ lúc bắt đầu tới lúc hoàn thành lượt; thiếu một trong hai thì null
   * - Tuần tính theo lịch CLB, bắt đầu thứ Hai
   *
   * @param horseId UUID của ngựa
   * @param period Khoảng ngày của báo cáo
   * @returns Promise trả về các lượt tập trong kỳ
   */
  participants(
    horseId: string,
    period: ReportPeriod,
  ): Promise<HorseProgressRow[]> {
    return this.dataSource.query(
      `SELECT p.id AS "participantId",
              s.id AS "sessionId",
              s.name AS "sessionName",
              s.scheduled_start_at AS "scheduledStartAt",
              s.session_type AS "sessionType",
              s.intensity,
              s.planned_distance_m AS "plannedDistanceM",
              p.status,
              EXTRACT(EPOCH FROM (p.completed_at - p.started_at))::float8 AS "trainedSeconds",
              e.score,
              e.comment,
              (SELECT MIN(r.elapsed_ms)::text FROM trial_results r
                WHERE r.session_participant_id = p.id) AS "bestTrialMs",
              to_char(date_trunc('week', s.scheduled_start_at AT TIME ZONE $4), 'YYYY-MM-DD') AS "weekStart"
         FROM session_participants p
         JOIN training_sessions s ON s.id = p.session_id
         LEFT JOIN performance_evaluations e ON e.session_participant_id = p.id
        WHERE p.horse_id = $1
          AND s.scheduled_start_at >= $2
          AND s.scheduled_start_at < $3
        ORDER BY s.scheduled_start_at, p.id`,
      [horseId, period.start, period.end, CLUB_TIME_ZONE],
    );
  }

  /**
   * Lấy lịch sử sức khỏe của ngựa trong kỳ
   *
   * - Đổi trạng thái sức khỏe: dòng audit của ngựa có trạng thái trước khác sau, ghi trong kỳ
   * - Số đo: đo trong kỳ, bỏ số đo đã xóa
   * - Ca bệnh, khóa huấn luyện: có thời gian giao với kỳ (ca chưa đóng, khóa chưa gỡ được coi là còn kéo dài)
   * - Chấn thương: đánh dấu của phiếu khám chưa hủy có ngày khám trong kỳ
   * - Mỗi danh sách sắp theo thời gian tăng dần
   *
   * @param horseId UUID của ngựa
   * @param period Khoảng ngày của báo cáo
   * @returns Promise trả về đổi trạng thái, số đo, ca bệnh, chấn thương và khóa huấn luyện
   */
  async health(
    horseId: string,
    period: ReportPeriod,
  ): Promise<HorseHealthRows> {
    const range = [horseId, period.start, period.end];
    const [statusChanges, measurements, medicalCases, injuries, trainingLocks] =
      await Promise.all([
        this.dataSource.query<HorseHealthRows['statusChanges']>(
          `SELECT created_at AS "changedAt",
                  before_data->>'healthStatus' AS "from",
                  after_data->>'healthStatus' AS "to",
                  reason
             FROM audit_logs
            WHERE entity_type = $4
              AND entity_id = $1
              AND created_at >= $2
              AND created_at < $3
              AND after_data ? 'healthStatus'
              AND before_data->>'healthStatus' IS DISTINCT FROM after_data->>'healthStatus'
            ORDER BY created_at, id`,
          [...range, AuditEntityType.HORSE],
        ),
        this.dataSource.query<HorseHealthRows['measurements']>(
          `SELECT type, value::text AS value, measured_at AS "measuredAt", is_abnormal AS "isAbnormal"
             FROM horse_measurements
            WHERE horse_id = $1
              AND measured_at >= $2
              AND measured_at < $3
              AND deleted_at IS NULL
            ORDER BY measured_at, id`,
          range,
        ),
        this.dataSource.query<HorseHealthRows['medicalCases']>(
          `SELECT id AS "caseId", status, opened_at AS "openedAt", closed_at AS "closedAt",
                  initial_diagnosis AS "initialDiagnosis", final_conclusion AS "finalConclusion"
             FROM medical_cases
            WHERE horse_id = $1
              AND opened_at < $3
              AND (closed_at IS NULL OR closed_at >= $2)
            ORDER BY opened_at, id`,
          range,
        ),
        this.dataSource.query<HorseHealthRows['injuries']>(
          `SELECT r.exam_date AS "examDate", j.body_region AS "bodyRegion",
                  j.injury_type AS "injuryType", i.recovery_status AS "recoveryStatus"
             FROM injury_markers i
             JOIN injuries j ON j.id = i.injury_id
             JOIN medical_records r ON r.id = i.medical_record_id
            WHERE r.horse_id = $1
              AND r.exam_date >= $2
              AND r.exam_date < $3
              AND r.voided_at IS NULL
            ORDER BY r.exam_date, i.id`,
          range,
        ),
        this.dataSource.query<HorseHealthRows['trainingLocks']>(
          `SELECT id AS "lockId", status, reason, lock_start AS "lockStart",
                  lock_end AS "lockEnd", released_at AS "releasedAt"
             FROM training_locks
            WHERE horse_id = $1
              AND lock_start < $3
              AND (released_at IS NULL OR released_at >= $2)
            ORDER BY lock_start, id`,
          range,
        ),
      ]);
    return {
      statusChanges,
      measurements,
      medicalCases,
      injuries,
      trainingLocks,
    };
  }
}

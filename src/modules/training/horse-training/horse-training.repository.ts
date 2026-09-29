import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { HorseTrainingSessionWhen } from '../enums/horse-training-session-when.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import type {
  HorseTrainingClassRow,
  HorseTrainingSessionFilter,
  HorseTrainingSessionRow,
  HorseTrainingTrialRow,
} from '../types/horse-training.types';

const HIDDEN_UPCOMING_STATUSES = [
  SessionParticipantStatus.CANCELLED,
  SessionParticipantStatus.CANCELLED_BY_LOCK,
];

const SESSION_FROM = `
  FROM session_participants sp
  JOIN training_sessions s ON s.id = sp.session_id
  JOIN training_plans p ON p.id = s.plan_id
  JOIN training_classes c ON c.id = p.class_id`;

/**
 * Các câu đọc gom nhiều bảng của training cho tab Huấn luyện trong hồ sơ ngựa (F1.3). Chỉ đọc.
 */
@Injectable()
export class HorseTrainingRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Liệt kê mọi lần ngựa vào lớp, lớp đang học đứng trước rồi tới lớp đã rời, mới nhất trước
   *
   * @param horseId UUID của ngựa
   * @returns A promise resolving to các lần vào lớp kèm tên lớp và Head Trainer phụ trách
   */
  listClasses(horseId: string): Promise<HorseTrainingClassRow[]> {
    return this.dataSource.query(
      `SELECT e.id AS "enrollmentId",
              c.id AS "classId",
              c.code AS "code",
              c.name AS "name",
              c.status AS "classStatus",
              u.full_name AS "headTrainerName",
              e.status AS "enrollmentStatus",
              e.enrolled_at AS "enrolledAt",
              e.left_at AS "leftAt"
         FROM horse_enrollments e
         JOIN training_classes c ON c.id = e.class_id
         LEFT JOIN users u ON u.id = c.head_trainer_id
        WHERE e.horse_id = $1
        ORDER BY (e.status = $2) DESC, e.enrolled_at DESC`,
      [horseId, HorseEnrollmentStatus.ACTIVE],
    );
  }

  /**
   * Đọc một trang lượt tập của ngựa kèm tổng số lượt khớp bộ lọc
   *
   * - upcoming: buổi bắt đầu từ `now` trở đi, gần nhất trước; bỏ lượt đã hủy (CANCELLED, CANCELLED_BY_LOCK) vì buổi chưa diễn ra phải biến mất khỏi lịch khi ngựa bị rút (F1.6 mục 4, F1.8 mục 1)
   * - history: buổi bắt đầu trước `now`, mới nhất trước
   * - Bỏ trống `when`: mọi buổi, mới nhất trước
   *
   * @param horseId UUID của ngựa
   * @param filter Lớp, khoảng thời gian và trang cần lấy
   * @returns A promise resolving to các lượt tập trong trang và tổng số lượt
   */
  async listSessions(
    horseId: string,
    filter: HorseTrainingSessionFilter,
  ): Promise<{ rows: HorseTrainingSessionRow[]; total: number }> {
    const params: unknown[] = [horseId];
    const where = ['sp.horse_id = $1'];
    if (filter.classId) {
      params.push(filter.classId);
      where.push(`c.id = $${params.length}`);
    }
    if (filter.when) {
      params.push(filter.now);
      where.push(
        filter.when === HorseTrainingSessionWhen.UPCOMING
          ? `s.scheduled_start_at >= $${params.length}`
          : `s.scheduled_start_at < $${params.length}`,
      );
    }
    if (filter.when === HorseTrainingSessionWhen.UPCOMING) {
      params.push(HIDDEN_UPCOMING_STATUSES);
      where.push(`sp.status <> ALL($${params.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const order =
      filter.when === HorseTrainingSessionWhen.UPCOMING ? 'ASC' : 'DESC';

    const [countRow] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS "total" ${SESSION_FROM} ${whereSql}`,
      params,
    );
    const rows = await this.dataSource.query<HorseTrainingSessionRow[]>(
      `SELECT sp.id AS "participantId",
              s.id AS "sessionId",
              c.id AS "classId",
              c.name AS "className",
              p.name AS "planName",
              p.phase_name AS "phaseName",
              s.name AS "name",
              s.session_type AS "sessionType",
              s.scheduled_start_at AS "scheduledStartAt",
              s.scheduled_end_at AS "scheduledEndAt",
              s.location AS "location",
              s.surface AS "surface",
              s.status AS "sessionStatus",
              sp.status AS "participantStatus",
              g.full_name AS "groomName",
              sp.absence_reason AS "absenceReason",
              sp.cancel_reason AS "cancelReason",
              sp.completed_at AS "completedAt"
         ${SESSION_FROM}
         LEFT JOIN users g ON g.id = sp.assigned_groom_id
         ${whereSql}
        ORDER BY s.scheduled_start_at ${order}, sp.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.limit, filter.skip],
    );
    return { rows, total: countRow?.total ?? 0 };
  }

  /**
   * Lấy kết quả time trial của các lượt tập, theo thứ tự lần chạy
   *
   * @param participantIds UUID các lượt tập cần lấy kết quả
   * @returns A promise resolving to các lần chạy, rỗng nếu không truyền lượt nào
   */
  async listTrialResults(
    participantIds: string[],
  ): Promise<HorseTrainingTrialRow[]> {
    if (participantIds.length === 0) return [];
    return this.dataSource.query(
      `SELECT tr.session_participant_id AS "participantId",
              tr.attempt_no AS "attemptNo",
              tr.elapsed_ms::text AS "elapsedMs",
              tr.notes AS "notes",
              tr.recorded_at AS "recordedAt"
         FROM trial_results tr
        WHERE tr.session_participant_id = ANY($1)
        ORDER BY tr.session_participant_id, tr.attempt_no`,
      [participantIds],
    );
  }
}

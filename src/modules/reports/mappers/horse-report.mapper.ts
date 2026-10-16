import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import type {
  HorseHealthResponseDto,
  HorseProgressResponseDto,
  HorseProgressSessionDto,
} from '../dto/horse-report.dto';
import type { HorseEntity } from '../../horses/entities/horse.entity';
import type {
  HorseHealthRows,
  HorseProgressRow,
  MetricGroupRow,
  ReportPeriod,
} from '../types/report.types';
import { metricFigures, toWeeks } from './report-metrics.mapper';

const INELIGIBLE_STATUSES: SessionParticipantStatus[] = [
  SessionParticipantStatus.INELIGIBLE,
  SessionParticipantStatus.CANCELLED_BY_LOCK,
];

/**
 * Dựng báo cáo tiến độ tập luyện của một con ngựa
 *
 * - Lượt không đủ điều kiện gồm cả lượt hủy do khóa huấn luyện
 * - Quãng đường và số phút tập chỉ tính lượt hoàn thành; số phút làm tròn tới số nguyên
 * - Biểu đồ tuần gồm mọi tuần có lượt hoàn thành hoặc có điểm đo
 *
 * @param horse Con ngựa của báo cáo
 * @param period Khoảng ngày của báo cáo
 * @param rows Các lượt tập trong kỳ
 * @param metricsByParticipant Tổng hợp điểm đo theo lượt
 * @param metricsByWeek Tổng hợp điểm đo theo tuần
 * @returns HorseProgressResponseDto
 */
export function toHorseProgress(
  horse: HorseEntity,
  period: ReportPeriod,
  rows: HorseProgressRow[],
  metricsByParticipant: MetricGroupRow[],
  metricsByWeek: MetricGroupRow[],
): HorseProgressResponseDto {
  const completed = rows.filter(
    (row) => row.status === SessionParticipantStatus.COMPLETED,
  );
  const byIntensity = (intensity: TrainingIntensity) =>
    completed.filter((row) => row.intensity === intensity).length;
  const metricsOfParticipant = new Map(
    metricsByParticipant.map((group) => [group.key, group]),
  );
  return {
    horseId: horse.id,
    horseName: horse.name,
    from: period.from,
    to: period.to,
    totals: {
      completed: completed.length,
      absent: rows.filter(
        (row) => row.status === SessionParticipantStatus.ABSENT,
      ).length,
      ineligible: rows.filter((row) => INELIGIBLE_STATUSES.includes(row.status))
        .length,
      plannedDistanceM: completed.reduce(
        (sum, row) => sum + row.plannedDistanceM,
        0,
      ),
      trainedMinutes: Math.round(
        completed.reduce((sum, row) => sum + (row.trainedSeconds ?? 0), 0) / 60,
      ),
      completedByIntensity: {
        LIGHT: byIntensity(TrainingIntensity.LIGHT),
        HEAVY: byIntensity(TrainingIntensity.HEAVY),
      },
    },
    weekly: toWeeks(
      completed.map((row) => ({ weekStart: row.weekStart, count: 1 })),
      metricsByWeek,
    ),
    sessions: rows.map((row): HorseProgressSessionDto => ({
      participantId: row.participantId,
      sessionId: row.sessionId,
      sessionName: row.sessionName,
      scheduledStartAt: row.scheduledStartAt,
      sessionType: row.sessionType,
      intensity: row.intensity,
      plannedDistanceM: row.plannedDistanceM,
      status: row.status,
      ...metricFigures(metricsOfParticipant.get(row.participantId)),
      evaluation:
        row.score === null ? null : { score: row.score, comment: row.comment },
      bestTrialMs: row.bestTrialMs === null ? null : Number(row.bestTrialMs),
    })),
  };
}

/**
 * Dựng báo cáo lịch sử sức khỏe của một con ngựa
 *
 * @param horse Con ngựa của báo cáo
 * @param period Khoảng ngày của báo cáo
 * @param rows Đổi trạng thái, số đo, ca bệnh, chấn thương và khóa huấn luyện trong kỳ
 * @returns HorseHealthResponseDto
 */
export function toHorseHealth(
  horse: HorseEntity,
  period: ReportPeriod,
  rows: HorseHealthRows,
): HorseHealthResponseDto {
  return {
    horseId: horse.id,
    horseName: horse.name,
    from: period.from,
    to: period.to,
    currentHealthStatus: horse.healthStatus,
    statusChanges: rows.statusChanges,
    measurements: rows.measurements.map((row) => ({
      ...row,
      value: Number(row.value),
    })),
    medicalCases: rows.medicalCases,
    injuries: rows.injuries,
    trainingLocks: rows.trainingLocks,
  };
}

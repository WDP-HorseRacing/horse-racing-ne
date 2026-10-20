import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../horses/enums/horse-status.enum';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import type {
  DashboardHorseDto,
  DashboardResponseDto,
} from '../dto/dashboard.dto';
import type {
  DashboardHorseRow,
  DashboardParticipantCountRow,
  MetricGroupRow,
  ReportPeriod,
} from '../types/report.types';
import { metricFigures, toWeeks } from './report-metrics.mapper';

/**
 * Số liệu đã đọc để dựng dashboard
 */
export interface DashboardSource {
  period: ReportPeriod;
  horses: DashboardHorseRow[];
  participantCounts: DashboardParticipantCountRow[];
  sessions: number;
  metricsByHorse: MetricGroupRow[];
  metricsByWeek: MetricGroupRow[];
}

const INELIGIBLE_STATUSES: SessionParticipantStatus[] = [
  SessionParticipantStatus.INELIGIBLE,
  SessionParticipantStatus.CANCELLED_BY_LOCK,
];

/**
 * Dựng dashboard từ số liệu đã đọc
 *
 * - Đàn ngựa chỉ tính ngựa đang hoạt động; bảng từng ngựa gồm mọi ngựa đã đọc
 * - Lượt không đủ điều kiện gồm cả lượt hủy do khóa huấn luyện
 * - Lượt dừng sớm đếm riêng, không tính vào lượt hoàn thành
 * - Biểu đồ tuần gồm mọi tuần có lượt hoàn thành, lượt dừng sớm hoặc có điểm đo, sắp theo tuần
 * - Nhịp tim trung bình làm tròn tới số nguyên, tốc độ tới SPEED_SCALE chữ số; không có điểm đo thì null
 *
 * @param source Ngựa, số lượt, số buổi và tổng hợp điểm đo của kỳ
 * @returns DashboardResponseDto
 */
export function toDashboard(source: DashboardSource): DashboardResponseDto {
  const completed = source.participantCounts.filter(
    (row) => row.status === SessionParticipantStatus.COMPLETED,
  );
  const stopped = source.participantCounts.filter(
    (row) => row.status === SessionParticipantStatus.STOPPED,
  );
  const sumOf = (rows: DashboardParticipantCountRow[]) =>
    rows.reduce((sum, row) => sum + row.count, 0);
  const herd = source.horses.filter(
    (horse) => horse.lifecycleStatus === HorseLifecycleStatus.ACTIVE,
  );
  const byHealth = (status: HorseHealthStatus) =>
    herd.filter((horse) => horse.healthStatus === status).length;
  const byIntensity = (intensity: TrainingIntensity) =>
    sumOf(completed.filter((row) => row.intensity === intensity));
  const metricsOfHorse = new Map(
    source.metricsByHorse.map((group) => [group.key, group]),
  );
  return {
    from: source.period.from,
    to: source.period.to,
    herd: {
      total: herd.length,
      byHealthStatus: {
        ELIGIBLE: byHealth(HorseHealthStatus.ELIGIBLE),
        UNDER_OBSERVATION: byHealth(HorseHealthStatus.UNDER_OBSERVATION),
        INJURED: byHealth(HorseHealthStatus.INJURED),
        QUARANTINED: byHealth(HorseHealthStatus.QUARANTINED),
      },
      trainingLocked: herd.filter((horse) => horse.trainingLocked).length,
    },
    training: {
      sessions: source.sessions,
      completed: sumOf(completed),
      stopped: sumOf(stopped),
      absent: sumOf(
        source.participantCounts.filter(
          (row) => row.status === SessionParticipantStatus.ABSENT,
        ),
      ),
      ineligible: sumOf(
        source.participantCounts.filter((row) =>
          INELIGIBLE_STATUSES.includes(row.status),
        ),
      ),
      completedByIntensity: {
        LIGHT: byIntensity(TrainingIntensity.LIGHT),
        HEAVY: byIntensity(TrainingIntensity.HEAVY),
      },
    },
    weekly: toWeeks(completed, stopped, source.metricsByWeek),
    horses: source.horses.map((horse): DashboardHorseDto => ({
      horseId: horse.horseId,
      horseName: horse.horseName,
      lifecycleStatus: horse.lifecycleStatus,
      barnId: horse.barnId,
      barnName: horse.barnName,
      healthStatus: horse.healthStatus,
      trainingLocked: horse.trainingLocked,
      completed: sumOf(
        completed.filter((row) => row.horseId === horse.horseId),
      ),
      ...metricFigures(metricsOfHorse.get(horse.horseId)),
      latestWeightKg:
        horse.latestWeightKg === null ? null : Number(horse.latestWeightKg),
    })),
  };
}

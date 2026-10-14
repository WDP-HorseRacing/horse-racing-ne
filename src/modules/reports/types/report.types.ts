import type { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import type { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import type { TrainingIntensity } from '../../training/enums/training-intensity.enum';

/**
 * Khoảng ngày của một báo cáo theo lịch CLB, kèm hai mốc thời điểm để truy vấn
 *
 * - start: 00:00 ngày from; end: 00:00 ngày sau ngày to (không lấy end)
 */
export interface ReportPeriod {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

/**
 * Bộ lọc ngựa của dashboard: một khu, hoặc các khu do một Head Trainer phụ trách
 */
export interface DashboardHorseFilter {
  barnId?: string;
  headTrainerId?: string;
}

/**
 * Một con ngựa trong phạm vi dashboard, đọc từ DB
 */
export interface DashboardHorseRow {
  horseId: string;
  horseName: string;
  barnId: string | null;
  barnName: string | null;
  healthStatus: HorseHealthStatus;
  trainingLocked: boolean;
  latestWeightKg: string | null;
}

/**
 * Số lượt tập theo ngựa, trạng thái lượt, cường độ buổi và tuần, đọc từ DB
 */
export interface DashboardParticipantCountRow {
  horseId: string;
  status: SessionParticipantStatus;
  intensity: TrainingIntensity;
  weekStart: string;
  count: number;
}

/**
 * Tổng hợp điểm đo nhịp tim, tốc độ của một nhóm (một ngựa hoặc một tuần), đọc từ MongoDB
 *
 * - sumSpeedMps, maxSpeedMps dạng chuỗi số thập phân
 */
export interface MetricGroupRow {
  key: string;
  count: number;
  sumHeartRateBpm: number;
  maxHeartRateBpm: number;
  sumSpeedMps: string;
  maxSpeedMps: string;
  alertCount: number;
}

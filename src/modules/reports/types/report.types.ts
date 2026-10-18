import type { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import type { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import type {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../../medical/constants/injury-marker.enum';
import type { MedicalCaseStatus } from '../../medical/constants/medical-case.enum';
import type { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import type { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import type { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import type { TrainingSessionType } from '../../training/enums/training-session-type.enum';

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

/**
 * Một lượt tập của ngựa trong kỳ kèm buổi, đánh giá và thời gian chạy thử tốt nhất, đọc từ DB
 */
export interface HorseProgressRow {
  participantId: string;
  sessionId: string;
  sessionName: string;
  scheduledStartAt: Date;
  sessionType: TrainingSessionType;
  intensity: TrainingIntensity;
  plannedDistanceM: number;
  status: SessionParticipantStatus;
  trainedSeconds: number | null;
  score: number | null;
  comment: string | null;
  bestTrialMs: string | null;
  weekStart: string;
}

/**
 * Lịch sử sức khỏe của ngựa trong kỳ, đọc từ DB
 */
export interface HorseHealthRows {
  statusChanges: Array<{
    changedAt: Date;
    from: HorseHealthStatus | null;
    to: HorseHealthStatus;
    reason: string | null;
  }>;
  measurements: Array<{
    type: HorseMeasurementType;
    value: string;
    measuredAt: Date;
    isAbnormal: boolean;
  }>;
  medicalCases: Array<{
    caseId: string;
    status: MedicalCaseStatus;
    openedAt: Date;
    closedAt: Date | null;
    initialDiagnosis: string;
    finalConclusion: string | null;
  }>;
  injuries: Array<{
    examDate: Date;
    bodyRegion: InjuryBodyRegion;
    injuryType: InjuryType;
    recoveryStatus: RecoveryStatus;
  }>;
  trainingLocks: Array<{
    lockId: string;
    status: TrainingLockStatus;
    reason: string;
    lockStart: Date;
    lockEnd: Date | null;
    releasedAt: Date | null;
  }>;
}

/**
 * Phí ngày của một con ngựa tính cho một chủ trong kỳ, đọc từ DB; ownerId null là các ngày ngựa không có chủ
 */
export interface DailyFeeRow {
  ownerId: string | null;
  ownerName: string | null;
  horseId: string;
  horseName: string;
  billedDays: number;
  dailyFee: string;
}

/**
 * Phụ phí chăm sóc riêng của một con ngựa trong kỳ, tính cho chủ lúc hết từng ngày, đọc từ DB; ownerId null là các ngày ngựa không có chủ
 */
export interface SurchargeRow {
  ownerId: string | null;
  ownerName: string | null;
  horseId: string;
  horseName: string;
  surcharge: string;
}

/**
 * Chi phí các buổi khám chưa hủy của một con ngựa trong kỳ, tính cho chủ vào ngày khám, đọc từ DB
 */
export interface MedicalChargeRow {
  ownerId: string | null;
  ownerName: string | null;
  horseId: string;
  horseName: string;
  visitCount: number;
  medicalCost: string;
}

/**
 * Giá trị vật tư nhập vào và đã dùng trong kỳ, đọc từ DB
 */
export interface SupplyValueRow {
  purchased: string;
  used: string;
}

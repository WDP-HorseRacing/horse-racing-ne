import type { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import type { CareScheduleType } from '../constants/care-schedule.enum';
import type { CheckupAnchors } from '../policies/medical.policy';

/**
 * Một con ngựa trong đàn cùng các mốc tính hạn khám định kỳ, đọc từ DB.
 */
export interface HorseCheckupAnchorRow extends CheckupAnchors {
  horseId: string;
  horseName: string;
  barnId: string | null;
  stallId: string | null;
  stallCode: string | null;
  healthStatus: HorseHealthStatus;
}

/**
 * Bộ lọc đàn ngựa cho lịch khám và bảng điều khiển y tế.
 */
export interface HerdFilter {
  horseIds?: string[];
  barnId?: string;
  healthStatus?: HorseHealthStatus;
}

/**
 * Một lịch chăm sóc định kỳ đến hạn, đọc từ DB.
 */
export interface DueCareScheduleRow {
  scheduleId: string;
  horseId: string;
  horseName: string;
  type: CareScheduleType;
  dueDate: string;
  assignedTo: string | null;
}

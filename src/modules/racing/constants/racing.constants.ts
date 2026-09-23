import { RaceStatus } from './race-status.enum';
import { RegistrationStatus } from './registration-status.enum';

/**
 * Các trạng thái đăng ký thi đấu còn mở (chưa bị từ chối hay rút). Dùng khi rút đăng ký hoặc đếm đăng ký bị ảnh hưởng lúc ngựa đổi vòng đời.
 */
export const OPEN_REGISTRATION_STATUSES = [
  RegistrationStatus.PROPOSED,
  RegistrationStatus.OWNER_APPROVED,
  RegistrationStatus.MANAGER_CONFIRMED,
];

/**
 * Các trạng thái của cuộc đua chưa diễn ra.
 */
export const UPCOMING_RACE_STATUSES = [RaceStatus.PLANNED, RaceStatus.OPEN];

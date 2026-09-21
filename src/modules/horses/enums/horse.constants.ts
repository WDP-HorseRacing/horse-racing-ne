import { UserRole } from '../../../common/enums/role.enum';
import type { HorseMeasurementSpec } from '../types/horse.types';
import { EligibilityReason } from './eligibility-reason.enum';
import { HorseMeasurementType } from './horse-measurement-type.enum';
import { HorseHealthStatus, HorseLifecycleStatus } from './horse-status.enum';

/**
 * The roles allowed to read horse profiles
 */
export const ALL_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
  UserRole.HORSE_OWNER,
];

/**
 * The pedigree depth used when the caller does not pass one
 */
export const PEDIGREE_DEFAULT_DEPTH = 2;

/**
 * The deepest pedigree the API returns
 */
export const PEDIGREE_MAX_DEPTH = 4;

/**
 * The clock skew allowed when a measurement time is slightly in the future
 */
export const CLOCK_SKEW_MS = 60_000;

/**
 * The time zone that decides which calendar day "today" is for the club
 */
export const CLUB_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * The ORDER BY expression that sorts horse names by the Vietnamese alphabet, bound to the `horse` query alias
 */
export const VIETNAMESE_NAME_ORDER = 'horse.name COLLATE "vi-x-icu"';

/**
 * The unit, allowed range and normal range of each measurement type
 */
export const HORSE_MEASUREMENT_SPECS: Record<
  HorseMeasurementType,
  HorseMeasurementSpec
> = {
  [HorseMeasurementType.WEIGHT]: {
    unit: 'kg',
    min: 30,
    max: 1500,
    normalMin: 400,
    normalMax: 600,
  },
  [HorseMeasurementType.HEIGHT]: {
    unit: 'cm',
    min: 50,
    max: 250,
    normalMin: 150,
    normalMax: 175,
  },
  [HorseMeasurementType.BODY_CONDITION]: {
    unit: 'score',
    min: 1,
    max: 9,
    normalMin: 4,
    normalMax: 6,
  },
  [HorseMeasurementType.TEMPERATURE]: {
    unit: 'celsius',
    min: 30,
    max: 45,
    normalMin: 37.2,
    normalMax: 38.3,
  },
};

/**
 * Các loại chỉ số mỗi role được ghi (F1.7). Role không có trong bảng thì không ghi được loại nào.
 *
 * - Head Trainer: cân nặng, điểm thể trạng (chỉ ngựa trong khu mình phụ trách)
 * - Veterinarian: cả bốn loại, toàn câu lạc bộ
 * - Groom: cân nặng, thân nhiệt (chỉ ngựa được giao)
 */
export const MEASUREMENT_TYPES_BY_ROLE: Partial<
  Record<UserRole, readonly HorseMeasurementType[]>
> = {
  [UserRole.HEAD_TRAINER]: [
    HorseMeasurementType.WEIGHT,
    HorseMeasurementType.BODY_CONDITION,
  ],
  [UserRole.VETERINARIAN]: Object.values(HorseMeasurementType),
  [UserRole.GROOM]: [
    HorseMeasurementType.WEIGHT,
    HorseMeasurementType.TEMPERATURE,
  ],
};

/**
 * Số ngày tối đa được nhập lùi thời điểm đo so với hiện tại.
 */
export const MEASUREMENT_BACKDATE_MAX_DAYS = 7;

/**
 * Thân nhiệt (°C) vượt quá ngưỡng này thì sinh cảnh báo sốt khẩn.
 */
export const FEVER_THRESHOLD_CELSIUS = 38.6;

/**
 * Cân nặng giảm quá bao nhiêu phần trăm so với mức cao nhất trong cửa sổ thì sinh cảnh báo.
 */
export const WEIGHT_DROP_PERCENT = 5;

/**
 * Số ngày của cửa sổ so sánh cân nặng, tính ngược từ thời điểm đo.
 */
export const WEIGHT_DROP_WINDOW_DAYS = 14;

/**
 * Tên domain event phát ra cho mỗi cảnh báo chỉ số, sau khi bản ghi đã lưu.
 * Payload là HorseMeasurementAlertEvent; module notifications nghe event này để gửi thông báo.
 */
export const HORSE_MEASUREMENT_ALERT_EVENT = 'horse.measurement.alert';

/**
 * The allowed lifecycle transitions from each status; a RETIRED horse can return to ACTIVE or be transferred, a TRANSFERRED horse can only come back as ACTIVE when the club buys it back
 */
export const LIFECYCLE_TRANSITIONS: Record<
  HorseLifecycleStatus,
  HorseLifecycleStatus[]
> = {
  [HorseLifecycleStatus.ACTIVE]: [
    HorseLifecycleStatus.RETIRED,
    HorseLifecycleStatus.TRANSFERRED,
  ],
  [HorseLifecycleStatus.RETIRED]: [
    HorseLifecycleStatus.ACTIVE,
    HorseLifecycleStatus.TRANSFERRED,
  ],
  [HorseLifecycleStatus.TRANSFERRED]: [HorseLifecycleStatus.ACTIVE],
};

/**
 * The eligibility reason for each non-eligible health status
 */
export const HEALTH_REASONS: Partial<
  Record<HorseHealthStatus, EligibilityReason>
> = {
  [HorseHealthStatus.UNDER_OBSERVATION]:
    EligibilityReason.HEALTH_UNDER_OBSERVATION,
  [HorseHealthStatus.INJURED]: EligibilityReason.HEALTH_INJURED,
  [HorseHealthStatus.QUARANTINED]: EligibilityReason.HEALTH_QUARANTINED,
};

/**
 * The conflict message when a microchip ID is already used by another horse
 */
export const MICROCHIP_TAKEN_MESSAGE = 'Microchip đã được dùng cho ngựa khác';

/**
 * The conflict message when the chosen stall already has a horse
 */
export const STALL_OCCUPIED_MESSAGE = 'Ô chuồng đang có ngựa ở';

/**
 * Các field của hồ sơ ngựa làm thay đổi phả hệ; sửa một trong số này phải giữ khoá phả hệ.
 */
export const PEDIGREE_FIELDS = [
  'gender',
  'sireId',
  'damId',
  'dateOfBirth',
] as const;

/**
 * Tên khoá advisory lock của Postgres dùng để xếp hàng các thao tác đổi phả hệ.
 */
export const PEDIGREE_LOCK_KEY = 'horses.pedigree';

/**
 * Các bảng có cột horse_id chứa dữ liệu nghiệp vụ của ngựa; ngựa có dòng ở bất kỳ bảng nào thì không được xóa hồ sơ
 */
export const HORSE_BUSINESS_TABLES = [
  'medical_records',
  'care_schedules',
  'training_locks',
  'training_plans',
  'race_registrations',
  'horse_ownerships',
  'stall_assignments',
  'groom_assignments',
  'feeding_plans',
  'daily_checklists',
  'incidents',
  'horse_measurements',
  'performance_thresholds',
] as const;

/**
 * Thông báo 409 khi hồ sơ ngựa đã bị người khác lưu sau lúc người gọi tải về (version lệch).
 */
export const STALE_HORSE_MESSAGE =
  'Hồ sơ ngựa vừa được người khác cập nhật, hãy tải lại để xem bản mới nhất';

/**
 * The conflict message for each unique index a horse write can violate under concurrent writes
 */
export const UNIQUE_CONFLICT_MESSAGES: Record<string, string> = {
  horses_microchip_uq: MICROCHIP_TAKEN_MESSAGE,
  stall_assignments_active_stall_uq: STALL_OCCUPIED_MESSAGE,
  horse_ownerships_active_rep_uq: 'Chỉ được có tối đa một chủ đại diện',
};

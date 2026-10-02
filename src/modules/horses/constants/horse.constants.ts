import { UserRole } from '../../../common/enums/role.enum';
import type { HorseMeasurementSpec } from '../types/horse.types';
import { EligibilityReason } from '../enums/eligibility-reason.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';

/**
 * Các role được xem hồ sơ ngựa
 */
export const HORSE_READER_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
  UserRole.HORSE_OWNER,
];

/**
 * Số đời tổ tiên cây phả hệ trả về: cha mẹ (đời 1) và ông bà (đời 2), cộng con ngựa đang xem là 3 đời.
 */
export const PEDIGREE_DEPTH = 2;

/**
 * Độ lệch đồng hồ cho phép khi thời điểm đo hơi lệch về tương lai
 */
export const CLOCK_SKEW_MS = 60_000;

/**
 * Múi giờ quyết định "hôm nay" là ngày nào theo lịch câu lạc bộ
 */
export const CLUB_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Biểu thức ORDER BY sắp tên ngựa theo bảng chữ cái tiếng Việt, gắn với alias `horse` của query
 */
export const VIETNAMESE_NAME_ORDER = 'horse.name COLLATE "vi-x-icu"';

/**
 * Đơn vị, khoảng cho phép và khoảng bình thường của từng loại chỉ số
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
 * Tên domain event phát ra sau khi ngựa được xếp hoặc đổi vào một khu và transaction đã commit.
 * Payload là HorseBarnAssignedEvent; module notifications nghe event này để báo Head Trainer khu mới.
 */
export const HORSE_BARN_ASSIGNED_EVENT = 'horse.barn.assigned';

/**
 * Tên domain event phát ra sau khi chuyển nhượng làm phân công Groom của ngựa tự kết thúc và transaction đã commit.
 * Payload là HorseGroomReleasedEvent; module notifications nghe event này để báo Groom đó.
 */
export const HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT =
  'horse.groom.released-by-transfer';

/**
 * Kết luận ghi vào lệnh khóa huấn luyện khi hệ thống tự gỡ do ngựa chuyển nhượng.
 */
export const TRANSFER_LOCK_RELEASE_CONCLUSION = 'Gỡ do chuyển nhượng';

/**
 * Các field hồ sơ ghi vào nhật ký khi tạo ngựa mới.
 */
export const CREATE_AUDIT_FIELDS = [
  'name',
  'gender',
  'breed',
  'color',
  'raceAptitude',
  'microchipId',
  'dateOfBirth',
  'mediaId',
  'sireId',
  'damId',
  'ownerId',
  'barnId',
  'healthStatus',
  'lifecycleStatus',
];

/**
 * Các bước chuyển vòng đời được phép từ mỗi trạng thái; ngựa RETIRED được quay lại ACTIVE hoặc chuyển nhượng, ngựa TRANSFERRED chỉ quay lại ACTIVE khi câu lạc bộ mua lại
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
 * Động từ tiếng Việt cho từng trạng thái vòng đời đích, dùng trong câu tóm tắt hệ quả.
 */
export const LIFECYCLE_VERBS: Record<HorseLifecycleStatus, string> = {
  [HorseLifecycleStatus.ACTIVE]: 'kích hoạt lại',
  [HorseLifecycleStatus.RETIRED]: 'giải nghệ',
  [HorseLifecycleStatus.TRANSFERRED]: 'chuyển nhượng',
};

/**
 * Lý do không đủ điều kiện ứng với từng trạng thái sức khỏe khác ELIGIBLE
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
 * Thông báo xung đột khi microchip ID đã được ngựa khác dùng
 */
export const MICROCHIP_TAKEN_MESSAGE = 'Microchip đã được dùng cho ngựa khác';

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
 * Các bảng có cột horse_id chứa dữ liệu nghiệp vụ của ngựa, kèm nhãn hiển thị khi báo lỗi chặn xóa.
 *
 * - Ngựa có dòng ở bất kỳ bảng nào (kể cả dòng đã đóng, đã hủy, đã xóa mềm) thì không được xóa hồ sơ.
 */
export const HORSE_BUSINESS_TABLES: Readonly<Record<string, string>> = {
  medical_records: 'buổi khám',
  medical_cases: 'bệnh án',
  medical_exam_requests: 'yêu cầu khám',
  care_schedules: 'lịch chăm sóc y tế',
  training_locks: 'lệnh khóa huấn luyện',
  horse_measurements: 'chỉ số cơ thể',
  stall_assignments: 'xếp ô chuồng',
  groom_assignments: 'phân công groom',
  horse_enrollments: 'lớp học',
  race_registrations: 'đăng ký thi đấu',
  feeding_plans: 'khẩu phần ăn',
  daily_checklists: 'checklist hằng ngày',
  incidents: 'báo cáo sự cố',
  performance_thresholds: 'ngưỡng hiệu suất',
};

/**
 * Thông báo 409 khi hồ sơ ngựa đã bị người khác lưu sau lúc người gọi tải về (version lệch).
 */
export const STALE_HORSE_MESSAGE =
  'Hồ sơ ngựa vừa được người khác cập nhật, hãy tải lại để xem bản mới nhất';

/**
 * Thông báo 403 khi Club Manager thao tác ghi trên hồ sơ ngựa đã xóa mềm; hồ sơ này chỉ xem được.
 */
export const DELETED_HORSE_READ_ONLY_MESSAGE =
  'Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác';

/**
 * Thông báo xung đột ứng với từng unique index mà thao tác ghi ngựa có thể vi phạm khi ghi đồng thời
 */
export const UNIQUE_CONFLICT_MESSAGES: Record<string, string> = {
  horses_microchip_uq: MICROCHIP_TAKEN_MESSAGE,
};

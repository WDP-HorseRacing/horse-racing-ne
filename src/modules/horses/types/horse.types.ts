import type { EligibilityReason } from '../enums/eligibility-reason.enum';
import type { HorseGender } from '../enums/horse-gender.enum';
import type {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../enums/horse-measurement-alert.enum';
import type { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import type { HorseParentRole } from '../enums/horse-parent-role.enum';
import type {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import type { RaceAptitude } from '../enums/race-aptitude.enum';
import type { UserRole } from '../../../common/enums/role.enum';
import type { HorseMeasurementEntity } from '../entities/horse-measurement.entity';

/**
 * Phạm vi ngựa mà người gọi được xem.
 *
 * - ALL: toàn bộ ngựa trong CLB (Club Manager, Head Trainer, Veterinarian, Groom).
 * - OWNER: chỉ ngựa mà Horse Owner đang sở hữu.
 */
export type HorseScope = { kind: 'ALL' } | { kind: 'OWNER'; userId: string };

/**
 * An ancestor row returned by the pedigree query
 */
export interface PedigreeAncestorRow {
  id: string;
  name: string;
  gender: HorseGender | null;
  breed: string | null;
  color: string | null;
  dateOfBirth: string | null;
  raceAptitude: RaceAptitude | null;
  isReference: boolean;
  generation: number;
  parentRole: HorseParentRole;
  childId: string;
}

/**
 * The current stall of a horse with its barn
 */
export interface HorseCurrentStallRow {
  horseId: string;
  stallId: string;
  stallCode: string;
  barnId: string;
  barnName: string;
}

/**
 * The unit, allowed range and normal range of a measurement type
 *
 * - min/max: ngoài khoảng này là nhập sai, API từ chối
 * - normalMin/normalMax: khoảng bình thường; ngoài khoảng vẫn ghi được nhưng bị đánh dấu bất thường
 */
export interface HorseMeasurementSpec {
  unit: string;
  min: number;
  max: number;
  normalMin: number;
  normalMax: number;
}

/**
 * Một cảnh báo sinh ra từ một lần ghi chỉ số.
 *
 * - FEVER: chỉ có loại và mức độ
 * - WEIGHT_DROP: kèm cân nặng mốc (cao nhất trong cửa sổ) và phần trăm giảm
 */
export type HorseMeasurementAlertResult =
  | {
      alert: HorseMeasurementAlert.FEVER;
      severity: HorseMeasurementAlertSeverity;
    }
  | {
      alert: HorseMeasurementAlert.WEIGHT_DROP;
      severity: HorseMeasurementAlertSeverity;
      baselineValue: number;
      dropPercent: number;
    };

/**
 * Payload của domain event HORSE_MEASUREMENT_ALERT_EVENT, phát một lần cho mỗi cảnh báo sau khi bản ghi đã lưu.
 *
 * Quy ước người nhận cho listener gửi thông báo (F1.7):
 * - FEVER (URGENT): mọi Veterinarian đang ACTIVE và Head Trainer của khu đang chứa ngựa
 * - WEIGHT_DROP (WARNING): như trên (cảnh báo y tế cho Vet, cảnh báo quá tải cho Head Trainer)
 */
export type HorseMeasurementAlertEvent = HorseMeasurementAlertResult & {
  measurementId: string;
  horseId: string;
  measuredBy: string;
  type: HorseMeasurementType;
  value: number;
  unit: string;
  measuredAt: Date;
};

/**
 * The horse fields needed to validate a sire or dam
 */
export interface ParentCandidate {
  id: string;
  gender: HorseGender | null;
  dateOfBirth: string | null;
}

/**
 * The child horse fields needed to validate its parents
 */
export interface ChildProfile {
  id?: string;
  dateOfBirth?: string | null;
}

/**
 * The horse state needed to evaluate training and racing eligibility
 */
export interface EligibilityInput {
  isReference: boolean;
  lifecycleStatus: HorseLifecycleStatus;
  healthStatus: HorseHealthStatus;
  hasActiveTrainingLock: boolean;
}

/**
 * The training and racing eligibility of a horse with the blocking reasons
 */
export interface EligibilityResult {
  trainingEligible: boolean;
  racingEligible: boolean;
  reasons: EligibilityReason[];
}

/**
 * Một người gắn với ngựa để hiển thị, ví dụ groom phụ trách hoặc chủ đại diện.
 */
export interface HorsePersonRow {
  id: string;
  fullName: string;
}

/**
 * Dữ liệu đầu vào để tính các cờ quyền của người gọi trên một hồ sơ ngựa.
 *
 * - roles: danh sách role lấy từ token.
 * - isReference, isDeleted, lifecycleStatus: trạng thái của ngựa.
 * - isInTrainerBarn: ngựa có nằm trong khu Head Trainer đang phụ trách không.
 * - isAssignedGroom: người gọi có đang được giao chăm con ngựa này không.
 */
export interface HorsePermissionInput {
  roles: UserRole[];
  isReference: boolean;
  isDeleted: boolean;
  lifecycleStatus: HorseLifecycleStatus;
  isInTrainerBarn: boolean;
  isAssignedGroom: boolean;
}

/**
 * Các cờ quyền của người gọi trên một hồ sơ ngựa.
 * FE dùng để ẩn/hiện nút và tab; các API ghi vẫn tự kiểm tra quyền.
 */
export interface HorsePermissions {
  canEdit: boolean;
  canEditRaceAptitude: boolean;
  canChangeLifecycle: boolean;
  canManageOwners: boolean;
  canChangeHealth: boolean;
  canRecordMeasurement: boolean;
  recordableMeasurementTypes: HorseMeasurementType[];
  canViewPedigree: boolean;
  canViewOwners: boolean;
  canViewMeasurementHistory: boolean;
  canViewMedicalRecords: boolean;
  canViewTrainingEvaluation: boolean;
  canViewPerformance: boolean;
  canViewPerformanceDetail: boolean;
  canOpenReferenceHorses: boolean;
  canActivateReference: boolean;
}

/**
 * Dữ liệu đã gom sẵn để dựng phần đầu (header) của hồ sơ ngựa.
 */
export interface HorseDetailParts {
  stall: HorseCurrentStallRow | null;
  groom: HorsePersonRow | null;
  representativeOwner: HorsePersonRow | null;
  latestMeasurements: HorseMeasurementEntity[];
  activeTrainingLock: boolean;
}

/**
 * Các field tùy chọn của header mà người gọi được xem.
 *
 * - includeParents: có trả sireId, damId không (Groom không được xem phả hệ).
 * - includeRepresentativeOwner: có trả chủ đại diện không (Veterinarian, Groom không được xem).
 */
export interface HorseDetailVisibility {
  includeParents: boolean;
  includeRepresentativeOwner: boolean;
}

/**
 * Một phần sở hữu Club Manager gửi lên khi gán hoặc đổi chủ.
 */
export interface OwnerShareInput {
  ownerId: string;
  percentage: number;
  isRepresentative?: boolean;
}

/**
 * Dòng sở hữu đang mở (endAt null) của một con ngựa, chỉ gồm các field cần để so sánh khi đổi chủ.
 */
export interface OpenOwnershipRow {
  id: string;
  ownerId: string;
  percentage: string;
  isRepresentative: boolean;
}

/**
 * Kết quả so sánh bộ chủ đang mở với bộ chủ mới.
 *
 * - closeIds: các dòng đang mở cần đóng (chủ bị bỏ, hoặc đổi tỉ lệ/cờ đại diện).
 * - inserts: các phần sở hữu cần tạo dòng mới.
 * - Dòng nào khớp hoàn toàn (cùng chủ, cùng tỉ lệ, cùng cờ đại diện) thì giữ nguyên, không nằm ở hai danh sách trên.
 */
export interface OwnershipChangePlan {
  closeIds: string[];
  inserts: OwnerShareInput[];
}

/**
 * Các việc dọn dẹp phải chạy cùng transaction khi đổi vòng đời ngựa. Mỗi cờ đúng một việc.
 *
 * - cancelTraining: hủy giáo án SCHEDULED/ACTIVE và buổi tập SCHEDULED của chúng.
 * - withdrawRegistrations: rút các đăng ký thi đấu còn mở ở cuộc đua chưa kết thúc.
 * - closeStallOwnershipGroom: kết thúc xếp chuồng, quyền sở hữu và phân công groom đang mở.
 * - releaseTrainingLock: tự gỡ khóa huấn luyện đang ACTIVE.
 */
export interface LifecycleSideEffects {
  cancelTraining: boolean;
  withdrawRegistrations: boolean;
  closeStallOwnershipGroom: boolean;
  releaseTrainingLock: boolean;
}

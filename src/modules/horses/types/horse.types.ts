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
  ownerId: string | null;
  generation: number;
  parentRole: HorseParentRole;
  childId: string;
}

/**
 * Vị trí hiện tại của ngựa trong chuồng trại.
 *
 * - Khu lấy từ horses.barn_id (Club Manager xếp), null nếu chưa xếp khu.
 * - Ô lấy từ dòng xếp ô đang mở, null nếu chưa xếp ô.
 */
export interface HorseLocationRow {
  horseId: string;
  barnId: string | null;
  barnName: string | null;
  stallId: string | null;
  stallCode: string | null;
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
 * Payload của domain event HORSE_BARN_ASSIGNED_EVENT, phát sau khi transaction xếp khu đã commit.
 *
 * - eventId: sinh mới cho mỗi lần xếp khu, dùng để chống gửi trùng thông báo
 */
export interface HorseBarnAssignedEvent {
  eventId: string;
  horseId: string;
  barnId: string;
}

/**
 * Payload của domain event HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT, phát sau khi transaction chuyển nhượng đã commit.
 *
 * - eventId: sinh mới cho mỗi lần chuyển nhượng, dùng để chống gửi trùng thông báo
 * - groomId: Groom vừa bị kết thúc phân công
 */
export interface HorseGroomReleasedEvent {
  eventId: string;
  horseId: string;
  groomId: string;
}

/**
 * The horse fields needed to validate a sire or dam
 */
export interface ParentCandidate {
  id: string;
  gender: HorseGender | null;
  dateOfBirth: string | null;
}

/**
 * Con ngựa đang được tham chiếu làm cha (asSire) hoặc mẹ (asDam) của ngựa khác, tính cả con đã xóa hồ sơ.
 */
export interface ParentUsage {
  asSire: boolean;
  asDam: boolean;
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
  isDeleted: boolean;
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
 * Một người gắn với ngựa để hiển thị, ví dụ groom phụ trách hoặc chủ sở hữu.
 */
export interface HorsePersonRow {
  id: string;
  fullName: string;
}

/**
 * Dữ liệu đầu vào để tính các cờ quyền của người gọi trên một hồ sơ ngựa.
 *
 * - roles: danh sách role lấy từ token.
 * - isDeleted, lifecycleStatus: trạng thái của ngựa.
 * - hasBarn: ngựa đã được Club Manager xếp khu chưa.
 * - isInTrainerBarn: ngựa có nằm trong khu Head Trainer đang phụ trách không.
 * - isAssignedGroom: người gọi có đang được giao chăm con ngựa này không.
 */
export interface HorsePermissionInput {
  roles: UserRole[];
  isDeleted: boolean;
  hasBarn: boolean;
  lifecycleStatus: HorseLifecycleStatus;
  isInTrainerBarn: boolean;
  isAssignedGroom: boolean;
}

/**
 * Các cờ quyền của người gọi trên một hồ sơ ngựa.
 * FE dùng để ẩn/hiện nút và tab; các API ghi vẫn tự kiểm tra quyền.
 */
export interface HorsePermissions {
  canEditProfile: boolean;
  canEditRaceAptitude: boolean;
  canAssignBarn: boolean;
  canAssignStallAndGroom: boolean;
  canChangeLifecycle: boolean;
  canDelete: boolean;
  canRestore: boolean;
  canChangeHealth: boolean;
  canRecordMeasurement: boolean;
  canDeleteMeasurement: boolean;
  canViewMedicalTab: boolean;
  canViewTrainingTab: boolean;
  canViewPerformanceTab: boolean;
}

/**
 * Dữ liệu đã gom sẵn để dựng phần đầu (header) của hồ sơ ngựa.
 */
export interface HorseDetailParts {
  location: HorseLocationRow;
  groom: HorsePersonRow | null;
  owner: HorsePersonRow | null;
  latestMeasurements: HorseMeasurementEntity[];
  activeTrainingLock: boolean;
}

/**
 * Các việc phải chạy cùng transaction khi đổi vòng đời ngựa (F1.8). Mỗi cờ đúng một việc.
 *
 * - cancelTraining: hủy giáo án SCHEDULED/ACTIVE và buổi tập SCHEDULED của chúng (tạm thay cho "rút khỏi lớp", chờ Flow 2).
 * - withdrawRegistrations: rút các đăng ký thi đấu còn mở ở cuộc đua chưa diễn ra.
 * - releaseStall: trả ô chuồng đang giữ về trống.
 * - endGroom: kết thúc phân công groom đang mở.
 * - clearBarn: bỏ khu chuồng (horses.barn_id = null).
 * - releaseTrainingLock: tự gỡ lệnh khóa huấn luyện đang ACTIVE.
 * - resetHealth: đặt sức khỏe về UNDER_OBSERVATION cho tới khi bác sĩ khám lại.
 * - reactivateFromTransfer: kích hoạt lại ngựa đã chuyển nhượng; ngựa vào "Chờ xếp khu" và chủ cũ không còn là HORSE_OWNER đang hoạt động thì bị bỏ trống.
 * - Chủ sở hữu không bao giờ bị đổi ở đây: chuyển nhượng vẫn giữ chủ để chủ cũ còn tra cứu.
 */
export interface LifecycleSideEffects {
  cancelTraining: boolean;
  withdrawRegistrations: boolean;
  releaseStall: boolean;
  endGroom: boolean;
  clearBarn: boolean;
  releaseTrainingLock: boolean;
  resetHealth: boolean;
  reactivateFromTransfer: boolean;
}

/**
 * Những gì sẽ bị ảnh hưởng nếu đổi vòng đời, đếm trên dữ liệu hiện tại để Club Manager xác nhận trước (F1.8 mục 5).
 */
export interface LifecycleImpactRow {
  openTrainingPlans: number;
  openRaceRegistrations: number;
  stallCode: string | null;
  groomName: string | null;
  barnName: string | null;
  hasActiveTrainingLock: boolean;
  invalidOwnerName: string | null;
}

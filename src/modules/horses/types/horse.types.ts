import type { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
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
 * Một dòng tổ tiên do query phả hệ trả về
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
 * Đơn vị, khoảng cho phép và khoảng bình thường của một loại chỉ số
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
 * Quy ước người nhận cho listener gửi thông báo:
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
  measuredAt: string;
  source: HorseMeasurementSource;
};

/**
 * Một bản ghi đo vừa lưu (đã load người đo) kèm các cảnh báo tính cho nó
 */
export interface SavedMeasurementWithAlerts {
  measurement: HorseMeasurementEntity;
  alerts: HorseMeasurementAlertResult[];
}

/**
 * Số đo lấy trong một buổi khám, ghi vào bảng chỉ số cơ thể với nguồn MEDICAL_EXAM.
 *
 * - feature: mã chức năng ghi vào nhật ký
 */
export interface ExamMeasurementInput {
  horseId: string;
  medicalRecordId: string;
  measuredBy: string;
  measuredAt: Date;
  values: Array<{ type: HorseMeasurementType; value: number }>;
  confirmAbnormal: boolean;
  feature: string;
}

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
 * Payload của domain event HORSE_OWNERSHIP_TRANSFERRED_EVENT, ghi vào outbox trong transaction chuyển nhượng nội bộ.
 *
 * - eventId: sinh mới cho mỗi lần chuyển, dùng để chống gửi trùng thông báo
 * - fromOwnerId, toOwnerId: chủ cũ và chủ mới
 * - transferredAt: thời điểm ghi nhận chuyển chủ (chuỗi ISO), cũng là lúc chủ mới bắt đầu sở hữu
 */
export interface HorseOwnershipTransferredEvent {
  eventId: string;
  horseId: string;
  fromOwnerId: string;
  toOwnerId: string;
  transferredAt: string;
}

/**
 * Một giai đoạn sở hữu: chủ và khoảng thời gian ghi nhận trên hệ thống
 *
 * - endedAt null: giai đoạn đang mở
 */
export interface OwnershipPeriod {
  ownerId: string;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Dữ liệu cần để kiểm tra một lần chuyển nhượng nội bộ
 */
export interface OwnershipTransferInput {
  lifecycleStatus: HorseLifecycleStatus;
  currentOwnerId: string | null;
  newOwnerId: string;
}

/**
 * Trạng thái vòng đời làm hồ sơ ngựa chỉ được xem (đã chuyển nhượng hoặc đã mất)
 */
export type ReadOnlyLifecycleStatus =
  HorseLifecycleStatus.TRANSFERRED | HorseLifecycleStatus.DECEASED;

/**
 * Payload của domain event HORSE_DECEASED_EVENT, ghi vào outbox trong transaction ghi nhận ngựa mất.
 *
 * - eventId: sinh mới cho mỗi lần ghi nhận, dùng để chống gửi trùng thông báo
 * - barnId, groomId: khu và Groom của ngựa trước khi bị dọn, null nếu không có
 * - dateOfDeath: ngày mất (YYYY-MM-DD); reason: nguyên nhân mất
 */
export interface HorseDeceasedEvent {
  eventId: string;
  horseId: string;
  barnId: string | null;
  groomId: string | null;
  dateOfDeath: string;
  reason: string;
}

/**
 * Các field của ngựa cần để kiểm tra cha hoặc mẹ
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
 * Các field của ngựa con cần để kiểm tra cha mẹ của nó
 */
export interface ChildProfile {
  id?: string;
  dateOfBirth?: string | null;
}

/**
 * Trạng thái ngựa cần để tính điều kiện được tập và được đua
 */
export interface EligibilityInput {
  isDeleted: boolean;
  lifecycleStatus: HorseLifecycleStatus;
  healthStatus: HorseHealthStatus;
  hasActiveTrainingLock: boolean;
}

/**
 * Điều kiện được tập, được đua của ngựa kèm lý do chặn
 */
export interface EligibilityResult {
  trainingEligible: boolean;
  racingEligible: boolean;
  /** Lý do không được tập, rỗng khi được tập */
  trainingReasons: EligibilityReason[];
  /** Lý do không được đua, rỗng khi được đua */
  racingReasons: EligibilityReason[];
  /** Mọi lý do, bằng racingReasons */
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
 * Các API ghi vẫn tự kiểm tra quyền.
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
  ownerSince: string | null;
  latestMeasurements: HorseMeasurementEntity[];
  activeTrainingLock: boolean;
}

/**
 * Các việc phải chạy cùng transaction khi đổi vòng đời ngựa. Mỗi cờ đúng một việc.
 *
 * - withdrawFromClasses: rút ngựa khỏi mọi lớp đang học (training).
 * - withdrawRegistrations: rút các đăng ký thi đấu còn mở ở cuộc đua chưa diễn ra.
 * - releaseStall: trả ô chuồng đang giữ về trống.
 * - endGroom: kết thúc phân công groom đang mở.
 * - clearBarn: bỏ khu chuồng (horses.barn_id = null).
 * - releaseTrainingLock: tự gỡ lệnh khóa huấn luyện đang ACTIVE.
 * - settleMedicalWork: chốt phần y tế khi chuyển nhượng: chặn nếu còn bệnh án mở, bỏ qua yêu cầu khám đang chờ, hủy lịch hẹn và lịch chăm sóc chưa làm.
 * - resetHealth: đặt sức khỏe về UNDER_OBSERVATION cho tới khi bác sĩ khám lại (chỉ khi kích hoạt lại từ chuyển nhượng).
 * - reactivateFromTransfer: kích hoạt lại ngựa đã chuyển nhượng; ngựa vào "Chờ xếp khu" và chủ cũ không còn là HORSE_OWNER đang hoạt động thì bị bỏ trống.
 * - Chủ sở hữu không bị đổi ở đây: chuyển nhượng vẫn giữ chủ.
 */
export interface LifecycleSideEffects {
  withdrawFromClasses: boolean;
  withdrawRegistrations: boolean;
  releaseStall: boolean;
  endGroom: boolean;
  clearBarn: boolean;
  releaseTrainingLock: boolean;
  settleMedicalWork: boolean;
  resetHealth: boolean;
  reactivateFromTransfer: boolean;
}

/**
 * Những gì sẽ bị ảnh hưởng nếu đổi vòng đời, đếm trên dữ liệu hiện tại.
 */
export interface LifecycleImpactRow {
  activeClasses: number;
  openRaceRegistrations: number;
  stallCode: string | null;
  groomName: string | null;
  barnName: string | null;
  hasActiveTrainingLock: boolean;
  invalidOwnerName: string | null;
  examRequestsToDismiss: number;
  careSchedulesToCancel: number;
}

/**
 * Khu chuồng đích khi xem trước việc đổi khu.
 */
export interface BarnPreviewTarget {
  id: string;
  name: string;
  headTrainerId: string | null;
  headTrainerName: string | null;
}

/**
 * Những gì sẽ bị ảnh hưởng khi đổi khu, đếm trên dữ liệu hiện tại.
 */
export interface BarnChangeImpactRow {
  /** Tên khu hiện tại, null nếu ngựa chưa có khu */
  fromBarnName: string | null;
  /** Mã ô đang giữ, null nếu chưa có ô */
  stallCode: string | null;
  /** Tên Groom đang phụ trách, null nếu chưa có */
  groomName: string | null;
  /** Số lớp đang học không do Head Trainer khu mới phụ trách */
  classesToWithdraw: number;
}

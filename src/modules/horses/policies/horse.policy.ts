import { UserRole } from '../../../common/enums/role.enum';
import { EligibilityReason } from '../enums/eligibility-reason.enum';
import { HorseGender } from '../enums/horse-gender.enum';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../enums/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import {
  CLOCK_SKEW_MS,
  FEVER_THRESHOLD_CELSIUS,
  HEALTH_REASONS,
  HORSE_MEASUREMENT_SPECS,
  LIFECYCLE_TRANSITIONS,
  MEASUREMENT_BACKDATE_MAX_DAYS,
  MEASUREMENT_TYPES_BY_ROLE,
  WEIGHT_DROP_PERCENT,
} from '../enums/horse.constants';
import type {
  ChildProfile,
  EligibilityInput,
  EligibilityResult,
  HorseMeasurementAlertResult,
  HorsePermissionInput,
  HorsePermissions,
  LifecycleSideEffects,
  OpenOwnershipRow,
  OwnerShareInput,
  OwnershipChangePlan,
  ParentCandidate,
} from '../types/horse.types';

/**
 * Check the sire and dam IDs against the child and each other
 * @param childId The ID of the child horse, undefined when creating a new horse
 * @param sireId The ID of the sire
 * @param damId The ID of the dam
 * @returns The error message if a parent is the child itself or the parents are the same, or null otherwise
 */
export function parentIdError(
  childId: string | undefined,
  sireId: string | null,
  damId: string | null,
): string | null {
  if (childId && (sireId === childId || damId === childId)) {
    return 'Ngựa không thể là cha/mẹ của chính nó';
  }
  if (sireId && damId && sireId === damId) {
    return 'Sire và dam không được trùng nhau';
  }
  return null;
}

/**
 * Check the gender and date of birth of the sire and dam against the child
 * @param child The child horse profile
 * @param sire The sire, or null if not set
 * @param dam The dam, or null if not set
 * @returns The error message if the sire is not male or gelding, the dam is not female, or a parent is not born before the child, or null otherwise
 */
export function parentProfileError(
  child: ChildProfile,
  sire: ParentCandidate | null,
  dam: ParentCandidate | null,
): string | null {
  if (
    sire &&
    sire.gender !== HorseGender.MALE &&
    sire.gender !== HorseGender.GELDING
  ) {
    return 'Sire phải là ngựa đực';
  }
  if (dam && dam.gender !== HorseGender.FEMALE) {
    return 'Dam phải là ngựa cái';
  }
  for (const parent of [sire, dam]) {
    if (
      parent?.dateOfBirth &&
      child.dateOfBirth &&
      parent.dateOfBirth >= child.dateOfBirth
    ) {
      return 'Cha/mẹ phải sinh trước ngựa con';
    }
  }
  return null;
}

/**
 * Check that a date of birth is not in the future
 * @param dateOfBirth The date of birth as YYYY-MM-DD, or null if not set
 * @param today Today's date as YYYY-MM-DD
 * @returns The error message if the date of birth is after today, or null otherwise
 */
export function dateOfBirthError(
  dateOfBirth: string | null | undefined,
  today: string,
): string | null {
  if (dateOfBirth && dateOfBirth > today) {
    return 'Ngày sinh không được ở tương lai';
  }
  return null;
}

/**
 * Kiểm tra ngày sinh mới của một con ngựa đang làm cha/mẹ vẫn trước ngày sinh của các con.
 *
 * - Chỉ cần so với con sinh sớm nhất
 * - Thiếu ngày sinh ở một bên thì bỏ qua, giống luật cha/mẹ khi tạo ngựa
 *
 * @param dateOfBirth Ngày sinh mới của ngựa (YYYY-MM-DD), null nếu không có
 * @param earliestChildBirthDate Ngày sinh sớm nhất trong các ngựa con (YYYY-MM-DD), null nếu không có
 * @returns Thông báo lỗi nếu ngày sinh mới không trước con sớm nhất, ngược lại null
 */
export function childBirthDateError(
  dateOfBirth: string | null,
  earliestChildBirthDate: string | null,
): string | null {
  if (
    dateOfBirth &&
    earliestChildBirthDate &&
    dateOfBirth >= earliestChildBirthDate
  ) {
    return 'Cha/mẹ phải sinh trước ngựa con';
  }
  return null;
}

/**
 * Kiểm tra con ngựa có kích hoạt được thành ngựa của câu lạc bộ không.
 * Chỉ ngựa tham chiếu mới kích hoạt được, và chỉ đi một chiều.
 *
 * @param isReference true nếu là ngựa tham chiếu
 * @returns Thông báo lỗi nếu ngựa đã thuộc câu lạc bộ, ngược lại null
 */
export function activationError(isReference: boolean): string | null {
  if (!isReference) {
    return 'Ngựa đã thuộc câu lạc bộ, không cần kích hoạt';
  }
  return null;
}

/**
 * Check whether a horse can move from one lifecycle status to another
 * @param from The current lifecycle status
 * @param to The target lifecycle status
 * @returns True if the transition is allowed
 */
export function canTransitionLifecycle(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * Xác định các việc dọn dẹp cần chạy khi ngựa chuyển sang vòng đời mới, dựa vào trạng thái đích.
 *
 * - RETIRED: hủy giáo án và rút đăng ký thi đấu, giữ ô chuồng và chế độ chăm sóc y tế
 * - TRANSFERRED: như RETIRED (trường hợp đi thẳng từ ACTIVE), thêm kết thúc chuồng/sở hữu/groom và tự gỡ khóa huấn luyện
 * - ACTIVE: không dọn gì, chuồng và chủ gán lại bằng API riêng
 *
 * @param to Trạng thái vòng đời đích
 * @returns Các cờ việc cần làm
 */
export function lifecycleSideEffects(
  to: HorseLifecycleStatus,
): LifecycleSideEffects {
  const leaving =
    to === HorseLifecycleStatus.RETIRED ||
    to === HorseLifecycleStatus.TRANSFERRED;
  const transferred = to === HorseLifecycleStatus.TRANSFERRED;
  return {
    cancelTraining: leaving,
    withdrawRegistrations: leaving,
    closeStallOwnershipGroom: transferred,
    releaseTrainingLock: transferred,
  };
}

/**
 * Liệt kê các field Head Trainer gửi lên nhưng không có quyền sửa.
 *
 * - Head Trainer chỉ được sửa sở trường cự ly (raceAptitude), vì đó là đánh giá chuyên môn
 * - Field có giá trị undefined được coi là không gửi lên
 *
 * @param fields Các field hồ sơ ngựa người gọi gửi lên, không gồm version
 * @returns Tên các field ngoài quyền, rỗng nếu hợp lệ
 */
export function trainerForbiddenFields(fields: object): string[] {
  return Object.entries(fields)
    .filter(([key, value]) => value !== undefined && key !== 'raceAptitude')
    .map(([key]) => key);
}

/**
 * Validate the ownership shares of a horse
 * @param shares The owners with their ownership percentages and optional representative flag
 * @returns The error message if an owner is duplicated, more than one owner is the representative, a share is not positive, or the shares do not sum to 100, or null otherwise
 */
export function ownerSharesError(
  shares: Array<{
    ownerId: string;
    percentage: number;
    isRepresentative?: boolean;
  }>,
): string | null {
  const ids = shares.map((share) => share.ownerId);
  if (new Set(ids).size !== ids.length) {
    return 'Danh sách chủ sở hữu bị trùng';
  }
  if (shares.filter((share) => share.isRepresentative).length > 1) {
    return 'Chỉ được chọn tối đa một chủ đại diện';
  }
  if (shares.some((share) => share.percentage <= 0)) {
    return 'Tỷ lệ sở hữu phải lớn hơn 0';
  }
  const totalCents = shares.reduce(
    (sum, share) => sum + Math.round(share.percentage * 100),
    0,
  );
  if (totalCents !== 10000) {
    return 'Tổng tỷ lệ sở hữu phải bằng 100';
  }
  return null;
}

/**
 * Kiểm tra thời điểm chuyển nhượng không nằm ở tương lai.
 *
 * @param transferredAt Thời điểm chuyển nhượng Club Manager gửi lên
 * @param now Thời điểm hiện tại
 * @returns Thông báo lỗi nếu thời điểm chuyển nhượng sau hiện tại, ngược lại null
 */
export function futureTransferError(
  transferredAt: Date,
  now: Date,
): string | null {
  return transferredAt.getTime() > now.getTime()
    ? 'Thời điểm chuyển nhượng không được ở tương lai'
    : null;
}

/**
 * Kiểm tra thời điểm chuyển nhượng nằm sau lần gán chủ gần nhất, để các khoảng sở hữu không chồng lên nhau.
 *
 * @param transferredAt Thời điểm chuyển nhượng Club Manager gửi lên
 * @param latestOpenStartAt startAt lớn nhất trong các dòng sở hữu đang mở, null nếu ngựa chưa có chủ
 * @returns Thông báo lỗi nếu thời điểm chuyển nhượng không sau latestOpenStartAt, ngược lại null
 */
export function staleTransferError(
  transferredAt: Date,
  latestOpenStartAt: Date | null,
): string | null {
  if (!latestOpenStartAt) return null;
  return transferredAt.getTime() > latestOpenStartAt.getTime()
    ? null
    : 'Thời điểm chuyển nhượng phải sau lần gán chủ gần nhất';
}

/**
 * So sánh bộ chủ đang mở với bộ chủ mới để biết dòng nào đóng, dòng nào tạo mới.
 *
 * - Chủ giữ nguyên tỉ lệ và cờ đại diện: giữ dòng cũ.
 * - Chủ bị bỏ, hoặc đổi tỉ lệ/cờ đại diện: đóng dòng cũ.
 * - Chủ mới, hoặc chủ cũ đổi tỉ lệ/cờ đại diện: tạo dòng mới.
 *
 * @param openRows Các dòng sở hữu đang mở của ngựa
 * @param shares Bộ chủ mới, đã qua ownerSharesError
 * @returns Danh sách id dòng cần đóng và các phần sở hữu cần tạo mới
 */
export function planOwnershipChange(
  openRows: OpenOwnershipRow[],
  shares: OwnerShareInput[],
): OwnershipChangePlan {
  const sameShare = (row: OpenOwnershipRow, share: OwnerShareInput) =>
    row.ownerId === share.ownerId &&
    Math.round(Number(row.percentage) * 100) ===
      Math.round(share.percentage * 100) &&
    row.isRepresentative === (share.isRepresentative ?? false);
  return {
    closeIds: openRows
      .filter((row) => !shares.some((share) => sameShare(row, share)))
      .map((row) => row.id),
    inserts: shares.filter(
      (share) => !openRows.some((row) => sameShare(row, share)),
    ),
  };
}

/**
 * Evaluate whether a horse can train and race; training allows UNDER_OBSERVATION health, racing requires ELIGIBLE health
 * @param input The horse state to evaluate
 * @returns The training and racing eligibility with all blocking reasons
 */
export function evaluateEligibility(
  input: EligibilityInput,
): EligibilityResult {
  if (input.isReference) {
    return {
      trainingEligible: false,
      racingEligible: false,
      reasons: [EligibilityReason.REFERENCE_HORSE],
    };
  }

  const reasons: EligibilityReason[] = [];
  const active = input.lifecycleStatus === HorseLifecycleStatus.ACTIVE;
  if (!active) reasons.push(EligibilityReason.LIFECYCLE_NOT_ACTIVE);

  const healthReason = HEALTH_REASONS[input.healthStatus];
  if (healthReason) reasons.push(healthReason);

  if (input.hasActiveTrainingLock) {
    reasons.push(EligibilityReason.ACTIVE_TRAINING_LOCK);
  }

  const trainableHealth =
    input.healthStatus === HorseHealthStatus.ELIGIBLE ||
    input.healthStatus === HorseHealthStatus.UNDER_OBSERVATION;

  return {
    // train đc khi active và sức khỏe trainable(ELIGIBLE và UNDER_OBSERVATION) và không có training lock
    trainingEligible: active && trainableHealth && !input.hasActiveTrainingLock,
    // race đc khi active và sức khỏe ELIGIBLE và không có training lock
    racingEligible:
      active &&
      input.healthStatus === HorseHealthStatus.ELIGIBLE &&
      !input.hasActiveTrainingLock,
    reasons,
  };
}

/**
 * Check a measurement value against the allowed range of its type
 * @param type The measurement type
 * @param value The measured value
 * @returns The error message if the value is out of range, or null otherwise
 */
export function measurementValueError(
  type: HorseMeasurementType,
  value: number,
): string | null {
  const spec = HORSE_MEASUREMENT_SPECS[type];
  if (value < spec.min || value > spec.max) {
    return `${type} phải trong khoảng ${spec.min}–${spec.max} ${spec.unit}`;
  }
  return null;
}

/**
 * Kiểm tra giá trị có nằm ngoài khoảng bình thường của loại chỉ số không (F1.7).
 *
 * @param type Loại chỉ số
 * @param value Giá trị đo
 * @returns true nếu giá trị nhỏ hơn normalMin hoặc lớn hơn normalMax
 */
export function isAbnormalMeasurement(
  type: HorseMeasurementType,
  value: number,
): boolean {
  const spec = HORSE_MEASUREMENT_SPECS[type];
  return value < spec.normalMin || value > spec.normalMax;
}

/**
 * Tính các cảnh báo tự động cho một lần ghi chỉ số (F1.7).
 *
 * - Thân nhiệt lớn hơn FEVER_THRESHOLD_CELSIUS: FEVER, mức URGENT
 * - Cân nặng giảm quá WEIGHT_DROP_PERCENT % so với mốc: WEIGHT_DROP, mức WARNING
 * - Mốc cân nặng do nơi gọi tính (cao nhất trong cửa sổ ngày trước thời điểm đo); null thì không so
 *
 * @param type Loại chỉ số
 * @param value Giá trị đo
 * @param weightBaseline Cân nặng mốc để so, null nếu không có hoặc không phải loại WEIGHT
 * @returns Danh sách cảnh báo, rỗng nếu không có
 */
export function measurementAlerts(
  type: HorseMeasurementType,
  value: number,
  weightBaseline: number | null,
): HorseMeasurementAlertResult[] {
  if (
    type === HorseMeasurementType.TEMPERATURE &&
    value > FEVER_THRESHOLD_CELSIUS
  ) {
    return [
      {
        alert: HorseMeasurementAlert.FEVER,
        severity: HorseMeasurementAlertSeverity.URGENT,
      },
    ];
  }
  if (
    type === HorseMeasurementType.WEIGHT &&
    weightBaseline !== null &&
    weightBaseline > 0
  ) {
    const dropPercent = ((weightBaseline - value) / weightBaseline) * 100;
    if (dropPercent > WEIGHT_DROP_PERCENT) {
      return [
        {
          alert: HorseMeasurementAlert.WEIGHT_DROP,
          severity: HorseMeasurementAlertSeverity.WARNING,
          baselineValue: weightBaseline,
          dropPercent: Math.round(dropPercent * 100) / 100,
        },
      ];
    }
  }
  return [];
}

/**
 * Liệt kê các loại chỉ số người gọi được ghi cho một con ngựa (F1.7).
 *
 * - Head Trainer chỉ tính khi ngựa nằm trong khu mình phụ trách
 * - Groom chỉ tính khi được giao chăm con ngựa này
 * - Veterinarian không giới hạn phạm vi
 * - Người có nhiều role: lấy hợp các loại của mọi role đủ điều kiện
 * - Không kiểm tra trạng thái ngựa (tham chiếu, chuyển nhượng); phần đó do nơi gọi lo
 *
 * @param input Role của người gọi và hai cờ phạm vi (trong khu, được giao)
 * @returns Các loại chỉ số được ghi, theo thứ tự khai báo của enum; rỗng nếu không ghi được gì
 */
export function recordableMeasurementTypes(
  input: Pick<
    HorsePermissionInput,
    'roles' | 'isInTrainerBarn' | 'isAssignedGroom'
  >,
): HorseMeasurementType[] {
  const inScope: Partial<Record<UserRole, boolean>> = {
    [UserRole.HEAD_TRAINER]: input.isInTrainerBarn,
    [UserRole.VETERINARIAN]: true,
    [UserRole.GROOM]: input.isAssignedGroom,
  };
  const allowed = new Set(
    input.roles
      .filter((role) => inScope[role])
      .flatMap((role) => MEASUREMENT_TYPES_BY_ROLE[role] ?? []),
  );
  return Object.values(HorseMeasurementType).filter((type) =>
    allowed.has(type),
  );
}

/**
 * Kiểm tra thời điểm đo: không ở tương lai, không lùi quá MEASUREMENT_BACKDATE_MAX_DAYS ngày.
 *
 * - Cho lệch đồng hồ CLOCK_SKEW_MS giữa máy người dùng và server ở phía tương lai
 *
 * @param measuredAt Thời điểm đo người gọi gửi lên
 * @param now Thời điểm hiện tại của server
 * @returns Thông báo lỗi nếu thời điểm đo không hợp lệ, ngược lại null
 */
export function measuredAtError(measuredAt: Date, now: Date): string | null {
  if (measuredAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    return 'Thời điểm đo không được ở tương lai';
  }
  const earliest =
    now.getTime() - MEASUREMENT_BACKDATE_MAX_DAYS * 24 * 60 * 60 * 1000;
  if (measuredAt.getTime() < earliest) {
    return `Chỉ được nhập lùi tối đa ${MEASUREMENT_BACKDATE_MAX_DAYS} ngày`;
  }
  return null;
}

/**
 * Tính các cờ quyền của người gọi trên hồ sơ ngựa, khớp với kiểm tra của từng API ghi.
 *
 * - Hồ sơ đã xóa: mọi cờ thao tác đều tắt.
 * - Ngựa tham chiếu: chỉ còn Club Manager sửa được hồ sơ.
 * - Ngựa đã chuyển nhượng: chỉ còn đổi được vòng đời.
 * - Người có nhiều role: chỉ cần một role được phép là cờ bật.
 *
 * @param input Role của người gọi và trạng thái của ngựa
 * @returns HorsePermissions - Các cờ quyền
 */
export function evaluateHorsePermissions(
  input: HorsePermissionInput,
): HorsePermissions {
  const has = (...roles: UserRole[]) =>
    roles.some((role) => input.roles.includes(role));
  const live = !input.isDeleted;
  const operational = live && !input.isReference;
  const writable =
    operational && input.lifecycleStatus !== HorseLifecycleStatus.TRANSFERRED;
  const viewsDetail = has(
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  );

  const editable =
    live && input.lifecycleStatus !== HorseLifecycleStatus.TRANSFERRED;
  const measurementTypes = writable ? recordableMeasurementTypes(input) : [];

  return {
    canEdit: has(UserRole.CLUB_MANAGER) && editable,
    canEditRaceAptitude:
      editable &&
      (has(UserRole.CLUB_MANAGER) ||
        (has(UserRole.HEAD_TRAINER) && input.isInTrainerBarn)),
    canChangeLifecycle: has(UserRole.CLUB_MANAGER) && operational,
    canManageOwners: has(UserRole.CLUB_MANAGER) && writable,
    canChangeHealth: has(UserRole.VETERINARIAN) && writable,
    canRecordMeasurement: measurementTypes.length > 0,
    recordableMeasurementTypes: measurementTypes,
    canViewPedigree: viewsDetail,
    canViewOwners: has(UserRole.CLUB_MANAGER, UserRole.HORSE_OWNER),
    canViewMeasurementHistory: true,
    canViewMedicalRecords:
      has(UserRole.CLUB_MANAGER, UserRole.VETERINARIAN, UserRole.HORSE_OWNER) ||
      (has(UserRole.HEAD_TRAINER) && input.isInTrainerBarn),
    canViewTrainingEvaluation:
      has(UserRole.CLUB_MANAGER, UserRole.VETERINARIAN, UserRole.HORSE_OWNER) ||
      (has(UserRole.HEAD_TRAINER) && input.isInTrainerBarn),
    canViewPerformance: viewsDetail,
    canViewPerformanceDetail: has(
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
    ),
    canOpenReferenceHorses: has(UserRole.CLUB_MANAGER),
    canActivateReference:
      has(UserRole.CLUB_MANAGER) && live && input.isReference,
  };
}

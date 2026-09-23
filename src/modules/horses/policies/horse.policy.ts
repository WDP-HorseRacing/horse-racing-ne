import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { EligibilityReason } from '../enums/eligibility-reason.enum';
import { HorseGender } from '../enums/horse-gender.enum';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../enums/horse-measurement-alert.enum';
import { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { HorsePlacementStatus } from '../enums/horse-placement-status.enum';
import {
  CLOCK_SKEW_MS,
  FEVER_THRESHOLD_CELSIUS,
  HEALTH_REASONS,
  HORSE_MEASUREMENT_SPECS,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_VERBS,
  MEASUREMENT_BACKDATE_MAX_DAYS,
  WEIGHT_DROP_PERCENT,
} from '../constants/horse.constants';
import type {
  ChildProfile,
  EligibilityInput,
  EligibilityResult,
  HorseMeasurementAlertResult,
  HorsePermissionInput,
  HorsePermissions,
  LifecycleImpactRow,
  LifecycleSideEffects,
  HorseScope,
  ParentCandidate,
  ParentUsage,
} from '../types/horse.types';

/**
 * Kiểm tra con ngựa có nằm trong phạm vi xem của người gọi không
 *
 * - Phạm vi ALL: mọi con ngựa
 * - Phạm vi OWNER (Horse Owner): chỉ ngựa có owner_id là người gọi
 *
 * @param horse Chủ sở hữu hiện tại của ngựa
 * @param scope Phạm vi xem của người gọi (HorseAccessService.scopeOf)
 * @returns true nếu người gọi được xem con ngựa
 */
export function isHorseInScope(
  horse: { ownerId: string | null },
  scope: HorseScope,
): boolean {
  return scope.kind === 'ALL' || horse.ownerId === scope.userId;
}

/**
 * Chặn chọn cha/mẹ trùng nhau hoặc chọn chính con ngựa làm cha/mẹ của nó
 *
 * @param childId UUID của ngựa con, undefined khi đang tạo ngựa mới
 * @param sireId UUID của cha, null nếu bỏ trống
 * @param damId UUID của mẹ, null nếu bỏ trống
 * @throws BadRequestException Nếu cha hoặc mẹ là chính ngựa con, hoặc cha trùng mẹ
 */
export function assertParentIds(
  childId: string | undefined,
  sireId: string | null,
  damId: string | null,
): void {
  if (childId && (sireId === childId || damId === childId)) {
    throw new BadRequestException('Ngựa không thể là cha/mẹ của chính nó');
  }
  if (sireId && damId && sireId === damId) {
    throw new BadRequestException('Sire và dam không được trùng nhau');
  }
}

/**
 * Kiểm tra giới tính và ngày sinh của cha mẹ so với ngựa con
 *
 * - Cha phải là ngựa đực (MALE hoặc GELDING), mẹ phải là ngựa cái
 * - Cha mẹ phải sinh trước ngựa con; thiếu ngày sinh ở một bên thì bỏ qua
 *
 * @param child Ngày sinh (và id nếu có) của ngựa con
 * @param sire Hồ sơ cha, null nếu bỏ trống
 * @param dam Hồ sơ mẹ, null nếu bỏ trống
 * @throws BadRequestException Nếu cha không phải ngựa đực, mẹ không phải ngựa cái, hoặc cha/mẹ không sinh trước ngựa con
 */
export function assertParentProfiles(
  child: ChildProfile,
  sire: ParentCandidate | null,
  dam: ParentCandidate | null,
): void {
  if (
    sire &&
    sire.gender !== HorseGender.MALE &&
    sire.gender !== HorseGender.GELDING
  ) {
    throw new BadRequestException('Sire phải là ngựa đực');
  }
  if (dam && dam.gender !== HorseGender.FEMALE) {
    throw new BadRequestException('Dam phải là ngựa cái');
  }
  for (const parent of [sire, dam]) {
    if (
      parent?.dateOfBirth &&
      child.dateOfBirth &&
      parent.dateOfBirth >= child.dateOfBirth
    ) {
      throw new BadRequestException('Cha/mẹ phải sinh trước ngựa con');
    }
  }
}

/**
 * Chặn ngày sinh ở tương lai
 *
 * @param dateOfBirth Ngày sinh (YYYY-MM-DD), null hoặc undefined nếu không có
 * @param today Ngày hôm nay theo giờ câu lạc bộ (YYYY-MM-DD)
 * @throws BadRequestException Nếu ngày sinh sau hôm nay
 */
export function assertDateOfBirth(
  dateOfBirth: string | null | undefined,
  today: string,
): void {
  if (dateOfBirth && dateOfBirth > today) {
    throw new BadRequestException('Ngày sinh không được ở tương lai');
  }
}

/**
 * Kiểm tra ngày sinh mới của một con ngựa đang làm cha/mẹ vẫn trước ngày sinh của các con
 *
 * - Chỉ cần so với con sinh sớm nhất (nơi gọi tính cả con đã xóa hồ sơ, vì khôi phục con sau này sẽ trỏ lại cha/mẹ này)
 * - Thiếu ngày sinh ở một bên thì bỏ qua, giống luật cha/mẹ khi tạo ngựa
 *
 * @param dateOfBirth Ngày sinh mới của ngựa (YYYY-MM-DD), null nếu không có
 * @param earliestChildBirthDate Ngày sinh sớm nhất trong các ngựa con (YYYY-MM-DD), null nếu không có
 * @throws BadRequestException Nếu ngày sinh mới không trước con sinh sớm nhất
 */
export function assertBornBeforeChildren(
  dateOfBirth: string | null,
  earliestChildBirthDate: string | null,
): void {
  if (
    dateOfBirth &&
    earliestChildBirthDate &&
    dateOfBirth >= earliestChildBirthDate
  ) {
    throw new BadRequestException('Cha/mẹ phải sinh trước ngựa con');
  }
}

/**
 * Chặn đổi giới tính làm sai vai trò cha/mẹ của ngựa trong phả hệ ngựa khác
 *
 * @param usage Ngựa đang là cha (asSire) hoặc mẹ (asDam) của ngựa khác, tính cả con đã xóa hồ sơ
 * @param gender Giới tính mới
 * @throws ConflictException Nếu ngựa đang là cha mà đổi thành FEMALE, hoặc đang là mẹ mà đổi khỏi FEMALE
 */
export function assertGenderKeepsPedigree(
  usage: ParentUsage,
  gender: HorseGender,
): void {
  if (usage.asSire && gender === HorseGender.FEMALE) {
    throw new ConflictException(
      'Ngựa đang là sire của ngựa khác, không thể đổi thành FEMALE',
    );
  }
  if (usage.asDam && gender !== HorseGender.FEMALE) {
    throw new ConflictException(
      'Ngựa đang là dam của ngựa khác, phải giữ giới tính FEMALE',
    );
  }
}

/**
 * Chặn xóa hồ sơ ngựa đang là cha/mẹ trong phả hệ ngựa khác (F1.8)
 *
 * @param usage Ngựa đang là cha (asSire) hoặc mẹ (asDam) của ngựa khác, tính cả con đã xóa hồ sơ
 * @throws ConflictException Nếu ngựa đang là cha hoặc mẹ của ngựa khác
 */
export function assertNotParent(usage: ParentUsage): void {
  if (usage.asSire || usage.asDam) {
    throw new ConflictException(
      'Ngựa đang là cha/mẹ trong phả hệ của ngựa khác, không thể xóa',
    );
  }
}

/**
 * Chặn xóa hồ sơ ngựa đã phát sinh dữ liệu nghiệp vụ (F1.8, E1)
 *
 * @param labels Nhãn các loại dữ liệu nghiệp vụ ngựa đang có, rỗng nếu chưa phát sinh gì
 * @throws ConflictException Nếu có ít nhất một loại dữ liệu; message liệt kê các loại đang vướng
 */
export function assertNoBusinessData(labels: string[]): void {
  if (labels.length > 0) {
    throw new ConflictException(
      `Ngựa đã phát sinh dữ liệu nghiệp vụ (${labels.join(', ')}), hãy đổi trạng thái vòng đời thay vì xóa`,
    );
  }
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
 * Tìm lý do không được đổi vòng đời theo bảng chuyển trạng thái (F1.8). Dùng cho màn xem trước, cần lý do mà không ném lỗi
 *
 * @param from Trạng thái vòng đời hiện tại
 * @param to Trạng thái vòng đời muốn chuyển sang
 * @returns Lý do chặn, hoặc null nếu được chuyển
 */
export function lifecycleTransitionError(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): string | null {
  return canTransitionLifecycle(from, to)
    ? null
    : `Không thể chuyển vòng đời từ ${from} sang ${to}`;
}

/**
 * Chặn đổi vòng đời không có trong bảng chuyển trạng thái (F1.8)
 *
 * @param from Trạng thái vòng đời hiện tại
 * @param to Trạng thái vòng đời muốn chuyển sang
 * @throws ConflictException Nếu không được chuyển giữa hai trạng thái
 */
export function assertLifecycleTransition(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): void {
  const error = lifecycleTransitionError(from, to);
  if (error) throw new ConflictException(error);
}

/**
 * Xác định các việc cần chạy khi ngựa đổi vòng đời (F1.8), dựa vào trạng thái hiện tại và trạng thái đích.
 *
 * - Giải nghệ (ACTIVE sang RETIRED): hủy giáo án đang mở, rút đăng ký thi đấu chưa diễn ra; giữ khu, ô, groom và y tế
 * - Chuyển nhượng: làm phần giải nghệ nếu đang ACTIVE; trả ô, kết thúc groom, bỏ khu, tự gỡ khóa huấn luyện; giữ chủ sở hữu
 * - Kích hoạt lại (sang ACTIVE): đặt sức khỏe về UNDER_OBSERVATION; lớp học và đăng ký thi đấu đã hủy không tự khôi phục
 * - Kích hoạt lại từ chuyển nhượng: ngựa vào "Chờ xếp khu"; chủ cũ không còn hợp lệ thì bỏ trống chủ (nơi gọi kiểm chủ)
 *
 * @param from Trạng thái vòng đời hiện tại
 * @param to Trạng thái vòng đời đích (đã qua canTransitionLifecycle)
 * @returns Các cờ việc cần làm, mỗi cờ một việc
 */
export function lifecycleSideEffects(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): LifecycleSideEffects {
  const retiringFromActive =
    from === HorseLifecycleStatus.ACTIVE &&
    (to === HorseLifecycleStatus.RETIRED ||
      to === HorseLifecycleStatus.TRANSFERRED);
  const transferred = to === HorseLifecycleStatus.TRANSFERRED;
  return {
    cancelTraining: retiringFromActive,
    withdrawRegistrations: retiringFromActive,
    releaseStall: transferred,
    endGroom: transferred,
    clearBarn: transferred,
    releaseTrainingLock: transferred,
    resetHealth: to === HorseLifecycleStatus.ACTIVE,
    reactivateFromTransfer:
      from === HorseLifecycleStatus.TRANSFERRED &&
      to === HorseLifecycleStatus.ACTIVE,
  };
}

/**
 * Tạo câu tóm tắt hệ quả khi đổi vòng đời, hiện ở bảng xác nhận (F1.8 mục 5; BA chốt 2026-09-23).
 *
 * - Câu 1 liệt kê những gì ngựa đang có và sẽ bị ảnh hưởng, câu 2 nói sẽ làm gì. Ví dụ: "Winx đang có 2 giáo án huấn luyện đang mở, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ hủy giáo án, rút khỏi giải."
 * - Chỉ nhắc mục thật sự có dữ liệu; không có gì thì chỉ còn câu 2
 *
 * @param horseName Tên ngựa
 * @param to Trạng thái vòng đời muốn chuyển sang
 * @param effects Các việc sẽ chạy (từ lifecycleSideEffects)
 * @param impact Số liệu hiện tại của ngựa
 * @returns Câu tóm tắt tiếng Việt
 */
export function lifecycleImpactSummary(
  horseName: string,
  to: HorseLifecycleStatus,
  effects: LifecycleSideEffects,
  impact: LifecycleImpactRow,
): string {
  const facts: string[] = [];
  const actions: string[] = [];
  if (effects.cancelTraining && impact.openTrainingPlans > 0) {
    facts.push(`${impact.openTrainingPlans} giáo án huấn luyện đang mở`);
    actions.push('hủy giáo án');
  }
  if (effects.withdrawRegistrations && impact.openRaceRegistrations > 0) {
    facts.push(`${impact.openRaceRegistrations} đăng ký thi đấu chưa diễn ra`);
    actions.push('rút khỏi giải');
  }
  if (effects.releaseStall && impact.stallCode) {
    facts.push(`ô chuồng ${impact.stallCode}`);
    actions.push('trả ô chuồng');
  }
  if (effects.endGroom && impact.groomName) {
    facts.push(`Groom ${impact.groomName} phụ trách`);
    actions.push('kết thúc phân công Groom');
  }
  if (effects.clearBarn && impact.barnName) {
    actions.push(`bỏ khu ${impact.barnName}`);
  }
  if (effects.releaseTrainingLock && impact.hasActiveTrainingLock) {
    facts.push('lệnh khóa huấn luyện');
    actions.push('gỡ khóa huấn luyện');
  }
  if (effects.reactivateFromTransfer) {
    actions.push(
      'đưa ngựa vào danh sách Chờ xếp khu (cần xếp lại khu, ô chuồng và Groom)',
    );
    if (impact.invalidOwnerName) {
      actions.push(
        `bỏ trống chủ ${impact.invalidOwnerName} vì tài khoản không còn là chủ ngựa đang hoạt động`,
      );
    }
  }
  if (effects.resetHealth) {
    actions.push('đặt sức khỏe về Cần theo dõi tới khi bác sĩ khám lại');
  }
  const verb = LIFECYCLE_VERBS[to];
  const consequence =
    actions.length > 0
      ? `Nếu ${verb} sẽ ${actions.join(', ')}.`
      : `Nếu ${verb} sẽ không ảnh hưởng dữ liệu nào khác.`;
  return facts.length > 0
    ? `${horseName} đang có ${facts.join(', ')}. ${consequence}`
    : consequence;
}

/**
 * Liệt kê các field Club Manager gửi lên nhưng không có quyền sửa (F1.4).
 *
 * - Sở trường cự ly là đánh giá chuyên môn, chỉ Head Trainer phụ trách khu được sửa (BA chốt Q-5)
 * - Field có giá trị undefined được coi là không gửi lên
 *
 * @param fields Các field hồ sơ ngựa người gọi gửi lên, không gồm version
 * @returns Tên các field ngoài quyền, rỗng nếu hợp lệ
 */
export function managerForbiddenFields(fields: object): string[] {
  return Object.entries(fields)
    .filter(([key, value]) => value !== undefined && key === 'raceAptitude')
    .map(([key]) => key);
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
 * Tính "được tập" và "được đua" của ngựa kèm mọi lý do chặn (mục III.4). Không lưu DB, tính lại mỗi lần hiển thị.
 *
 * - Được tập: hồ sơ chưa xóa, vòng đời ACTIVE, sức khỏe ELIGIBLE hoặc UNDER_OBSERVATION, không có lệnh khóa huấn luyện
 * - Được đua: hồ sơ chưa xóa, vòng đời ACTIVE, sức khỏe ELIGIBLE, không có lệnh khóa huấn luyện
 * - Lý do vòng đời tách riêng Đã giải nghệ / Đã chuyển nhượng để giao diện hiện đúng câu
 *
 * @param input Trạng thái hồ sơ, vòng đời, sức khỏe và cờ khóa huấn luyện của ngựa
 * @returns Hai cờ được tập, được đua và danh sách lý do chặn (rỗng nếu không bị chặn gì)
 */
export function evaluateEligibility(
  input: EligibilityInput,
): EligibilityResult {
  const reasons: EligibilityReason[] = [];
  if (input.isDeleted) reasons.push(EligibilityReason.PROFILE_DELETED);
  if (input.lifecycleStatus === HorseLifecycleStatus.RETIRED) {
    reasons.push(EligibilityReason.LIFECYCLE_RETIRED);
  }
  if (input.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
    reasons.push(EligibilityReason.LIFECYCLE_TRANSFERRED);
  }
  const active =
    !input.isDeleted && input.lifecycleStatus === HorseLifecycleStatus.ACTIVE;

  const healthReason = HEALTH_REASONS[input.healthStatus];
  if (healthReason) reasons.push(healthReason);

  if (input.hasActiveTrainingLock) {
    reasons.push(EligibilityReason.ACTIVE_TRAINING_LOCK);
  }

  const trainableHealth =
    input.healthStatus === HorseHealthStatus.ELIGIBLE ||
    input.healthStatus === HorseHealthStatus.UNDER_OBSERVATION;

  return {
    trainingEligible: active && trainableHealth && !input.hasActiveTrainingLock,
    racingEligible:
      active &&
      input.healthStatus === HorseHealthStatus.ELIGIBLE &&
      !input.hasActiveTrainingLock,
    reasons,
  };
}

/**
 * Chặn giá trị đo nằm ngoài khoảng cho phép của loại chỉ số (F1.5)
 *
 * @param type Loại chỉ số
 * @param value Giá trị đo
 * @throws BadRequestException Nếu giá trị nhỏ hơn min hoặc lớn hơn max của loại chỉ số
 */
export function assertMeasurementValue(
  type: HorseMeasurementType,
  value: number,
): void {
  const spec = HORSE_MEASUREMENT_SPECS[type];
  if (value < spec.min || value > spec.max) {
    throw new BadRequestException(
      `${type} phải trong khoảng ${spec.min}–${spec.max} ${spec.unit}`,
    );
  }
}

/**
 * Chặn một lần đo ghi trùng loại chỉ số (F1.5, A1)
 *
 * @param types Các loại chỉ số trong lần đo
 * @throws BadRequestException Nếu có loại bị gửi hơn một lần
 */
export function assertDistinctMeasurementTypes(
  types: HorseMeasurementType[],
): void {
  if (new Set(types).size !== types.length) {
    throw new BadRequestException(
      'Mỗi loại chỉ số chỉ ghi một giá trị trong một lần đo',
    );
  }
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
 * Chặn xóa bản ghi đo đến từ buổi khám (F1.5 mục 4): bản ghi đó phải xử lý ở hồ sơ y tế
 *
 * @param source Nguồn của bản ghi đo
 * @throws ConflictException Nếu bản ghi có nguồn MEDICAL_EXAM
 */
export function assertMeasurementDeletable(
  source: HorseMeasurementSource,
): void {
  if (source === HorseMeasurementSource.MEDICAL_EXAM) {
    throw new ConflictException(
      'Bản ghi đến từ buổi khám, cần xử lý ở hồ sơ y tế',
    );
  }
}

/**
 * Bắt người ghi xác nhận trước khi lưu giá trị ngoài khoảng bình thường (F1.5)
 *
 * @param values Các cặp loại/giá trị trong lần đo
 * @param confirmed Người ghi đã gửi confirmAbnormal = true chưa
 * @throws UnprocessableEntityException Nếu có giá trị ngoài khoảng bình thường mà chưa xác nhận; message liệt kê các loại bất thường
 */
export function assertAbnormalConfirmed(
  values: Array<{ type: HorseMeasurementType; value: number }>,
  confirmed: boolean,
): void {
  const abnormalTypes = values
    .filter((item) => isAbnormalMeasurement(item.type, item.value))
    .map((item) => item.type);
  if (abnormalTypes.length > 0 && !confirmed) {
    throw new UnprocessableEntityException(
      `Giá trị ngoài khoảng bình thường (${abnormalTypes.join(', ')}). Gửi lại với confirmAbnormal = true để xác nhận lưu`,
    );
  }
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
 * Kiểm tra thời điểm đo: không ở tương lai, không lùi quá MEASUREMENT_BACKDATE_MAX_DAYS ngày
 *
 * - Cho lệch đồng hồ CLOCK_SKEW_MS giữa máy người dùng và server ở phía tương lai
 *
 * @param measuredAt Thời điểm đo người gọi gửi lên
 * @param now Thời điểm hiện tại của server
 * @throws BadRequestException Nếu thời điểm đo ở tương lai hoặc lùi quá số ngày cho phép
 */
export function assertMeasuredAt(measuredAt: Date, now: Date): void {
  if (measuredAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw new BadRequestException('Thời điểm đo không được ở tương lai');
  }
  const earliest =
    now.getTime() - MEASUREMENT_BACKDATE_MAX_DAYS * 24 * 60 * 60 * 1000;
  if (measuredAt.getTime() < earliest) {
    throw new BadRequestException(
      `Chỉ được nhập lùi tối đa ${MEASUREMENT_BACKDATE_MAX_DAYS} ngày`,
    );
  }
}

/**
 * Kiểm tra người gọi có được ghi chỉ số cơ thể cho con ngựa không (F1.5). Ai được ghi thì ghi được cả bốn loại.
 *
 * - Veterinarian: toàn câu lạc bộ
 * - Head Trainer: chỉ ngựa thuộc khu mình phụ trách
 * - Groom: chỉ ngựa được phân công
 * - Club Manager, Horse Owner: chỉ xem
 * - Người có nhiều role: chỉ cần một role đủ điều kiện
 * - Không xét trạng thái ngựa (đã xóa, đã chuyển nhượng); phần đó do nơi gọi lo
 *
 * @param input Role của người gọi và hai cờ phạm vi (trong khu, được giao)
 * @returns true nếu được ghi
 */
export function canRecordMeasurement(
  input: Pick<
    HorsePermissionInput,
    'roles' | 'isInTrainerBarn' | 'isAssignedGroom'
  >,
): boolean {
  return (
    input.roles.includes(UserRole.VETERINARIAN) ||
    (input.roles.includes(UserRole.HEAD_TRAINER) && input.isInTrainerBarn) ||
    (input.roles.includes(UserRole.GROOM) && input.isAssignedGroom)
  );
}

/**
 * Tính tình trạng xếp chỗ của ngựa để hiện nhãn "Chờ xếp khu" / "Chờ xếp ô" (F1.1).
 *
 * - Bộ lọc danh sách tính cùng luật này bằng SQL (PLACEMENT_STATUS_SQL trong horse-profiles.repository.ts); sửa một bên thì phải sửa bên kia
 *
 * @param lifecycleStatus Vòng đời của ngựa
 * @param barnId Khu của ngựa, null nếu chưa xếp
 * @param stallId Ô đang mở của ngựa, null nếu chưa xếp
 * @returns Tình trạng xếp chỗ; ngựa đã chuyển nhượng luôn là NOT_APPLICABLE
 */
export function placementStatusOf(
  lifecycleStatus: HorseLifecycleStatus,
  barnId: string | null,
  stallId: string | null,
): HorsePlacementStatus {
  if (lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
    return HorsePlacementStatus.NOT_APPLICABLE;
  }
  if (!barnId) return HorsePlacementStatus.PENDING_BARN;
  if (!stallId) return HorsePlacementStatus.PENDING_STALL;
  return HorsePlacementStatus.PLACED;
}

/**
 * Tính các cờ quyền của người gọi trên hồ sơ ngựa, khớp với kiểm tra của từng API ghi.
 *
 * - Hồ sơ đã xóa: chỉ còn Club Manager khôi phục được, mọi thao tác khác tắt (F1.3 mục 4).
 * - Ngựa đã chuyển nhượng: hồ sơ chỉ đọc, chỉ còn Club Manager đổi được vòng đời để kích hoạt lại (F1.8).
 * - Head Trainer chỉ thao tác ngựa thuộc khu mình; ngựa chưa có khu thì Head Trainer không thao tác được.
 * - Tab Bệnh án, Huấn luyện: mọi vai trò trừ Groom. Tab Thành tích: Club Manager, Head Trainer, Horse Owner (F1.3).
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
  const writable =
    live && input.lifecycleStatus !== HorseLifecycleStatus.TRANSFERRED;
  const trainerInBarn = has(UserRole.HEAD_TRAINER) && input.isInTrainerBarn;

  return {
    canEditProfile: has(UserRole.CLUB_MANAGER) && writable,
    canEditRaceAptitude: trainerInBarn && writable,
    canAssignBarn: has(UserRole.CLUB_MANAGER) && writable,
    canAssignStallAndGroom: trainerInBarn && input.hasBarn && writable,
    canChangeLifecycle: has(UserRole.CLUB_MANAGER) && live,
    canDelete: has(UserRole.CLUB_MANAGER) && writable,
    canRestore: has(UserRole.CLUB_MANAGER) && input.isDeleted,
    canChangeHealth: has(UserRole.VETERINARIAN) && writable,
    canRecordMeasurement: writable && canRecordMeasurement(input),
    canDeleteMeasurement: has(UserRole.VETERINARIAN) && writable,
    canViewMedicalTab: has(
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
      UserRole.HORSE_OWNER,
    ),
    canViewTrainingTab: has(
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
      UserRole.HORSE_OWNER,
    ),
    canViewPerformanceTab: has(
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.HORSE_OWNER,
    ),
  };
}

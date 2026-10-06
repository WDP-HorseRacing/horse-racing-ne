import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { subtractYears } from '../../../common/utils/club-date';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import type { UserEntity } from '../../users/entities/user.entity';
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
  READ_ONLY_LIFECYCLE_STATUSES,
  DECEASED_HORSE_READ_ONLY_MESSAGE,
  FEVER_THRESHOLD_CELSIUS,
  HEALTH_REASONS,
  HORSE_MEASUREMENT_SPECS,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_VERBS,
  HORSE_NOT_DELETED_MESSAGE,
  HORSE_NOT_FOUND_MESSAGE,
  MAX_HORSE_AGE_YEARS,
  MEASUREMENT_BACKDATE_MAX_DAYS,
  MIN_HORSE_AGE_YEARS,
  MIN_PARENT_AGE_GAP_YEARS,
  MS_PER_DAY,
  RACE_APTITUDE_FIELD,
  TRANSFERRED_HORSE_READ_ONLY_MESSAGE,
  WEIGHT_DROP_PERCENT,
} from '../constants/horse.constants';
import type {
  ChildProfile,
  ReadOnlyLifecycleStatus,
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
  BarnChangeImpactRow,
} from '../types/horse.types';

/**
 * Kiểm tra con ngựa có nằm trong phạm vi xem của người gọi không
 *
 * - Phạm vi ALL: mọi con ngựa
 * - Phạm vi OWNER (Horse Owner): chỉ ngựa có owner_id là người gọi
 *
 * @param horse Con ngựa cần kiểm, chỉ dùng owner_id
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
    throw new BadRequestException('Ngựa cha và ngựa mẹ không được trùng nhau');
  }
}

/**
 * Kiểm tra giới tính và ngày sinh của cha mẹ so với ngựa con
 *
 * - Cha phải là ngựa đực (MALE hoặc GELDING), mẹ phải là ngựa cái
 * - Cha mẹ phải sinh trước ngựa con ít nhất MIN_PARENT_AGE_GAP_YEARS năm, đúng bằng thì qua
 * - Thiếu ngày sinh ở một bên thì bỏ qua khoảng cách tuổi
 *
 * @param child Ngày sinh (và id nếu có) của ngựa con
 * @param sire Hồ sơ cha, null nếu bỏ trống
 * @param dam Hồ sơ mẹ, null nếu bỏ trống
 * @throws BadRequestException Nếu cha không phải ngựa đực hoặc chưa đủ khoảng cách tuổi (lỗi gắn ô `sireId`), mẹ không phải ngựa cái hoặc chưa đủ khoảng cách tuổi (lỗi gắn ô `damId`)
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
    throw fieldBadRequest('sireId', 'Ngựa cha phải là ngựa đực');
  }
  if (dam && dam.gender !== HorseGender.FEMALE) {
    throw fieldBadRequest('damId', 'Ngựa mẹ phải là ngựa cái');
  }
  if (!child.dateOfBirth) return;
  const latestParentBirthDate = subtractYears(
    child.dateOfBirth,
    MIN_PARENT_AGE_GAP_YEARS,
  );
  if (sire?.dateOfBirth && sire.dateOfBirth > latestParentBirthDate) {
    throw fieldBadRequest(
      'sireId',
      `Ngựa cha phải lớn hơn ngựa con ít nhất ${MIN_PARENT_AGE_GAP_YEARS} tuổi`,
    );
  }
  if (dam?.dateOfBirth && dam.dateOfBirth > latestParentBirthDate) {
    throw fieldBadRequest(
      'damId',
      `Ngựa mẹ phải lớn hơn ngựa con ít nhất ${MIN_PARENT_AGE_GAP_YEARS} tuổi`,
    );
  }
}

/**
 * Kiểm tra ngày sinh nằm trong khoảng tuổi câu lạc bộ nhận
 *
 * - Muộn hơn ngày này MIN_HORSE_AGE_YEARS năm trước: 400, chưa đủ tuổi
 * - Sớm hơn ngày này MAX_HORSE_AGE_YEARS năm trước: 400, quá tuổi
 * - Không có ngày sinh: bỏ qua
 *
 * @param dateOfBirth Ngày sinh (YYYY-MM-DD), null hoặc undefined nếu không có
 * @param today Ngày hôm nay theo giờ câu lạc bộ (YYYY-MM-DD)
 * @throws BadRequestException Nếu ngựa chưa đủ tuổi hoặc quá tuổi, lỗi gắn ô `dateOfBirth`
 */
export function assertDateOfBirth(
  dateOfBirth: string | null | undefined,
  today: string,
): void {
  if (!dateOfBirth) return;
  if (dateOfBirth > subtractYears(today, MIN_HORSE_AGE_YEARS)) {
    throw fieldBadRequest(
      'dateOfBirth',
      `Ngày sinh không hợp lệ: câu lạc bộ chỉ nhận ngựa đủ ${MIN_HORSE_AGE_YEARS} tuổi trở lên`,
    );
  }
  if (dateOfBirth < subtractYears(today, MAX_HORSE_AGE_YEARS)) {
    throw fieldBadRequest(
      'dateOfBirth',
      `Ngày sinh không hợp lệ: ngựa không thể quá ${MAX_HORSE_AGE_YEARS} tuổi`,
    );
  }
}

/**
 * Kiểm tra ngày sinh mới của một con ngựa đang làm cha/mẹ vẫn trước ngày sinh của các con ít nhất MIN_PARENT_AGE_GAP_YEARS năm
 *
 * - Chỉ cần so với con sinh sớm nhất (nơi gọi tính cả con đã xóa hồ sơ)
 * - Đúng bằng khoảng cách tối thiểu thì qua
 * - Thiếu ngày sinh ở một bên thì bỏ qua, giống luật cha/mẹ khi tạo ngựa
 *
 * @param dateOfBirth Ngày sinh mới của ngựa (YYYY-MM-DD), null nếu không có
 * @param earliestChildBirthDate Ngày sinh sớm nhất trong các ngựa con (YYYY-MM-DD), null nếu không có
 * @throws BadRequestException Nếu ngày sinh mới chưa đủ khoảng cách với con sinh sớm nhất, lỗi gắn ô `dateOfBirth`
 */
export function assertBornBeforeChildren(
  dateOfBirth: string | null,
  earliestChildBirthDate: string | null,
): void {
  if (
    dateOfBirth &&
    earliestChildBirthDate &&
    dateOfBirth >
      subtractYears(earliestChildBirthDate, MIN_PARENT_AGE_GAP_YEARS)
  ) {
    throw fieldBadRequest(
      'dateOfBirth',
      `Ngày sinh này phải trước ngày sinh của ngựa con sớm nhất ít nhất ${MIN_PARENT_AGE_GAP_YEARS} năm`,
    );
  }
}

/**
 * Chặn đổi giới tính làm sai vai trò cha/mẹ của ngựa trong phả hệ ngựa khác
 *
 * @param usage Ngựa đang là cha (asSire) hoặc mẹ (asDam) của ngựa khác, tính cả con đã xóa hồ sơ
 * @param gender Giới tính mới
 * @throws ConflictException Nếu ngựa đang là cha mà đổi thành ngựa cái, hoặc đang là mẹ mà đổi khỏi ngựa cái
 */
export function assertGenderKeepsPedigree(
  usage: ParentUsage,
  gender: HorseGender,
): void {
  if (usage.asSire && gender === HorseGender.FEMALE) {
    throw new ConflictException(
      'Ngựa đang là cha của ngựa khác, không thể đổi thành ngựa cái',
    );
  }
  if (usage.asDam && gender !== HorseGender.FEMALE) {
    throw new ConflictException(
      'Ngựa đang là mẹ của ngựa khác, phải giữ giới tính ngựa cái',
    );
  }
}

/**
 * Chặn xóa hồ sơ ngựa đang là cha/mẹ trong phả hệ ngựa khác
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
 * Chặn xóa hồ sơ ngựa đã phát sinh dữ liệu nghiệp vụ
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
 * Kiểm tra ngựa có được chuyển từ trạng thái vòng đời này sang trạng thái khác không
 *
 * @param from Trạng thái vòng đời hiện tại
 * @param to Trạng thái vòng đời muốn chuyển sang
 * @returns true nếu được chuyển
 */
export function canTransitionLifecycle(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * Tìm lý do không được đổi vòng đời theo bảng chuyển trạng thái; trả về lý do thay vì ném lỗi
 *
 * - Ngựa đã mất: lý do là DECEASED_HORSE_READ_ONLY_MESSAGE
 *
 * @param from Trạng thái vòng đời hiện tại
 * @param to Trạng thái vòng đời muốn chuyển sang
 * @returns Lý do chặn, hoặc null nếu được chuyển
 */
export function lifecycleTransitionError(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): string | null {
  if (canTransitionLifecycle(from, to)) return null;
  if (from === HorseLifecycleStatus.DECEASED) {
    return DECEASED_HORSE_READ_ONLY_MESSAGE;
  }
  return `Không thể chuyển vòng đời từ ${from} sang ${to}`;
}

/**
 * Kiểm tra ngày mất gửi kèm khi đổi vòng đời
 *
 * - Sang DECEASED: bắt buộc ngày mất, không ở tương lai, không trước ngày sinh (nếu biết)
 * - Sang trạng thái khác: không được gửi ngày mất
 *
 * @param to Trạng thái vòng đời muốn chuyển sang
 * @param dateOfDeath Ngày mất (YYYY-MM-DD), undefined nếu không gửi
 * @param dateOfBirth Ngày sinh của ngựa (YYYY-MM-DD), null nếu không biết
 * @param today Ngày hôm nay theo giờ câu lạc bộ (YYYY-MM-DD)
 * @throws BadRequestException Nếu thiếu, thừa hoặc sai ngày mất, lỗi gắn ô `dateOfDeath`
 */
export function assertDateOfDeath(
  to: HorseLifecycleStatus,
  dateOfDeath: string | undefined,
  dateOfBirth: string | null,
  today: string,
): void {
  if (to !== HorseLifecycleStatus.DECEASED) {
    if (dateOfDeath !== undefined) {
      throw fieldBadRequest(
        'dateOfDeath',
        'Chỉ nhập ngày mất khi ghi nhận ngựa mất',
      );
    }
    return;
  }
  if (dateOfDeath === undefined) {
    throw fieldBadRequest('dateOfDeath', 'Cần nhập ngày mất');
  }
  if (dateOfDeath > today) {
    throw fieldBadRequest('dateOfDeath', 'Ngày mất không được ở tương lai');
  }
  if (dateOfBirth && dateOfDeath < dateOfBirth) {
    throw fieldBadRequest('dateOfDeath', 'Ngày mất không được trước ngày sinh');
  }
}

/**
 * Câu chặn thao tác ghi trên hồ sơ chỉ được xem, theo trạng thái
 */
const READ_ONLY_LIFECYCLE_MESSAGES: Record<ReadOnlyLifecycleStatus, string> = {
  [HorseLifecycleStatus.TRANSFERRED]: TRANSFERRED_HORSE_READ_ONLY_MESSAGE,
  [HorseLifecycleStatus.DECEASED]: DECEASED_HORSE_READ_ONLY_MESSAGE,
};

/**
 * Lý do không đổi được khu khi hồ sơ chỉ được xem, theo trạng thái
 */
const BARN_CHANGE_READ_ONLY_REASONS: Record<ReadOnlyLifecycleStatus, string> = {
  [HorseLifecycleStatus.TRANSFERRED]: 'Ngựa đã chuyển nhượng, hồ sơ chỉ đọc',
  [HorseLifecycleStatus.DECEASED]: 'Ngựa đã mất, hồ sơ chỉ đọc',
};

/**
 * Kiểm tra vòng đời làm hồ sơ chỉ được xem (trạng thái thuộc READ_ONLY_LIFECYCLE_STATUSES)
 *
 * @param lifecycleStatus Vòng đời của ngựa
 * @returns true nếu ngựa đã chuyển nhượng hoặc đã mất
 */
export function isReadOnlyLifecycle(
  lifecycleStatus: HorseLifecycleStatus,
): lifecycleStatus is ReadOnlyLifecycleStatus {
  return (
    READ_ONLY_LIFECYCLE_STATUSES as readonly HorseLifecycleStatus[]
  ).includes(lifecycleStatus);
}

/**
 * Lấy câu chặn thao tác ghi khi hồ sơ chỉ được xem
 *
 * @param lifecycleStatus Vòng đời của ngựa
 * @returns Câu chặn, null nếu ngựa còn ở câu lạc bộ
 */
export function readOnlyLifecycleMessage(
  lifecycleStatus: HorseLifecycleStatus,
): string | null {
  return isReadOnlyLifecycle(lifecycleStatus)
    ? READ_ONLY_LIFECYCLE_MESSAGES[lifecycleStatus]
    : null;
}

/**
 * Chặn chọn chủ sở hữu không phải HORSE_OWNER đang hoạt động
 *
 * @param user Tài khoản được chọn làm chủ, null nếu không có hoặc đã xóa
 * @throws BadRequestException Nếu tài khoản không có hoặc không phải HORSE_OWNER
 * @throws ConflictException Nếu là HORSE_OWNER nhưng không còn ACTIVE
 */
export function assertAssignableOwner<
  T extends Pick<UserEntity, 'role' | 'status'>,
>(user: T | null): asserts user is T {
  if (user === null || user.role !== UserRole.HORSE_OWNER) {
    throw new BadRequestException('Chủ sở hữu không hợp lệ');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new ConflictException('Chủ sở hữu không ở trạng thái hoạt động');
  }
}

/**
 * Kiểm tra việc gán chủ sở hữu khi sửa hồ sơ
 *
 * - Bỏ trống chủ (null): 400
 * - Ngựa đã có chủ và gửi chủ khác: 409, phải dùng chuyển nhượng nội bộ
 * - Gửi lại đúng chủ hiện tại hoặc gán chủ cho ngựa chưa có chủ: qua
 *
 * @param currentOwnerId Chủ hiện tại, null nếu ngựa chưa có chủ
 * @param ownerId Chủ gửi lên
 * @throws BadRequestException Nếu bỏ trống chủ, lỗi gắn ô `ownerId`
 * @throws ConflictException Nếu ngựa đã có chủ khác
 */
export function assertOwnerAssignment(
  currentOwnerId: string | null,
  ownerId: string | null,
): void {
  if (ownerId === null) {
    throw fieldBadRequest(
      'ownerId',
      'Không bỏ trống chủ sở hữu được, đổi chủ bằng chức năng chuyển nhượng nội bộ',
    );
  }
  if (currentOwnerId !== null && currentOwnerId !== ownerId) {
    throw new ConflictException(
      'Ngựa đã có chủ sở hữu, đổi chủ bằng chức năng chuyển nhượng nội bộ',
    );
  }
}

/**
 * Kiểm tra tài khoản có đang là HORSE_OWNER hoạt động không
 *
 * @param user Tài khoản cần kiểm, null nếu không có
 * @returns true nếu tài khoản tồn tại, có role HORSE_OWNER và đang ACTIVE
 */
export function isActiveHorseOwner(
  user: Pick<UserEntity, 'role' | 'status'> | null,
): boolean {
  return (
    user?.role === UserRole.HORSE_OWNER && user.status === UserStatus.ACTIVE
  );
}

/**
 * Chặn xem trước hoặc khôi phục khi hồ sơ không có hoặc chưa bị xóa
 *
 * @param horse Con ngựa đã tải kèm hồ sơ đã xóa, null nếu không có
 * @throws NotFoundException Nếu không có hồ sơ ngựa
 * @throws ConflictException Nếu hồ sơ chưa bị xóa
 */
export function assertDeletedHorse<T extends { deletedAt: Date | null }>(
  horse: T | null,
): asserts horse is T {
  if (!horse) throw new NotFoundException(HORSE_NOT_FOUND_MESSAGE);
  if (horse.deletedAt === null) {
    throw new ConflictException(HORSE_NOT_DELETED_MESSAGE);
  }
}

/**
 * Chặn thao tác ghi khi hồ sơ ngựa chỉ được xem
 *
 * - Đã chuyển nhượng: 409 TRANSFERRED_HORSE_READ_ONLY_MESSAGE
 * - Đã mất: 409 DECEASED_HORSE_READ_ONLY_MESSAGE
 *
 * @param horse Con ngựa cần kiểm
 * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất
 */
export function assertLifecycleWritable(horse: {
  lifecycleStatus: HorseLifecycleStatus;
}): void {
  const message = readOnlyLifecycleMessage(horse.lifecycleStatus);
  if (message) throw new ConflictException(message);
}

/**
 * Tạo câu tóm tắt hệ quả khi khôi phục hồ sơ đã xóa
 *
 * @param horseName Tên ngựa
 * @param barnCleared Tên khu ngựa sẽ rời, null nếu ngựa không có khu
 * @param ownerCleared Tên chủ sẽ bị bỏ trống, null nếu giữ chủ
 * @returns Câu tóm tắt, ví dụ: Nếu khôi phục, Winx sẽ rời khu "Khu A" và vào Chờ xếp khu.
 */
export function restoreImpactSummary(
  horseName: string,
  barnCleared: string | null,
  ownerCleared: string | null,
): string {
  const actions: string[] = [];
  if (barnCleared !== null) {
    actions.push(`rời khu "${barnCleared}" và vào Chờ xếp khu`);
  }
  if (ownerCleared !== null) {
    actions.push(`bỏ trống chủ sở hữu ${ownerCleared}`);
  }
  if (actions.length === 0) {
    return `Nếu khôi phục, ${horseName} trở lại như trước khi xóa.`;
  }
  return `Nếu khôi phục, ${horseName} sẽ ${actions.join(', ')}.`;
}

/**
 * Bắt lý do khi đổi khu cho ngựa đã có khu; xếp khu lần đầu (ngựa đang Chờ xếp khu) không cần lý do
 *
 * @param currentBarnId Khu hiện tại của ngựa, null nếu đang Chờ xếp khu
 * @param reason Lý do người dùng nhập, đã cắt khoảng trắng
 * @throws BadRequestException Nếu ngựa đã có khu mà không có lý do
 */
export function assertBarnChangeReason(
  currentBarnId: string | null,
  reason: string | undefined,
): void {
  if (currentBarnId !== null && !reason) {
    throw new BadRequestException('Đổi khu bắt buộc nhập lý do');
  }
}

/**
 * Chặn đổi vòng đời không có trong bảng chuyển trạng thái
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
 * Xác định các việc cần chạy khi ngựa đổi vòng đời, dựa vào trạng thái hiện tại (from) và trạng thái đích (to).
 *
 * Các kịch bản chính:
 * 1. Giải nghệ (ACTIVE -> RETIRED): 
 *    - Rút khỏi lớp đang học và giải đua chưa diễn ra.
 *    - Các tài nguyên thực tế (khu, ô chuồng, groom và bệnh án y tế) được giữ nguyên.
 * 2. Đang giải nghệ đem chuyển nhượng (RETIRED -> TRANSFERRED): 
 *    - Rút khỏi lớp (để phòng hờ). 
 *    - Dọn dẹp tài nguyên: trả ô chuồng, kết thúc groom, bỏ khu, gỡ khóa huấn luyện, chốt bệnh án y tế.
 * 3. Đang hoạt động đem chuyển nhượng (ACTIVE -> TRANSFERRED): 
 *    - Gộp cả (1) và (2): rút khỏi lớp, rút giải đua, và dọn dẹp sạch sẽ tài nguyên (trả ô, bỏ khu, kết thúc groom, chốt y tế).
 * 4. Ghi nhận ngựa mất (ACTIVE/RETIRED -> DECEASED): làm như chuyển nhượng từ trạng thái đó.
 * 5. Kích hoạt lại (RETIRED/TRANSFERRED -> ACTIVE): 
 *    - Lớp học và giải đua cũ không tự khôi phục. 
 *    - Từ RETIRED: giữ nguyên trạng thái sức khỏe hiện tại. 
 *    - Từ TRANSFERRED: tự động đặt sức khỏe về UNDER_OBSERVATION, đưa ngựa vào trạng thái "Chờ xếp khu".
 *
 * Chú ý: Thao tác chuyển nhượng không xoá trường "Chủ sở hữu" để đảm bảo lưu trữ lịch sử.
 *
 * @param from Trạng thái vòng đời hiện tại
 * @param to Trạng thái vòng đời đích (đã qua canTransitionLifecycle)
 * @returns Các cờ việc cần làm, mỗi cờ một việc
 */
export function lifecycleSideEffects(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): LifecycleSideEffects {
  const becomesReadOnly = isReadOnlyLifecycle(to);
  const retiringFromActive =
    from === HorseLifecycleStatus.ACTIVE &&
    (to === HorseLifecycleStatus.RETIRED || becomesReadOnly);
  const reactivateFromTransfer =
    from === HorseLifecycleStatus.TRANSFERRED &&
    to === HorseLifecycleStatus.ACTIVE;
  return {
    withdrawFromClasses: retiringFromActive || becomesReadOnly,
    withdrawRegistrations: retiringFromActive,
    releaseStall: becomesReadOnly,
    endGroom: becomesReadOnly,
    clearBarn: becomesReadOnly,
    releaseTrainingLock: becomesReadOnly,
    settleMedicalWork: becomesReadOnly,
    resetHealth: reactivateFromTransfer,
    reactivateFromTransfer,
  };
}

/**
 * Tạo câu tóm tắt hệ quả khi đổi vòng đời
 *
 * - Câu 1 liệt kê những gì ngựa đang có và sẽ bị ảnh hưởng, câu 2 nói sẽ làm gì. Ví dụ: "Winx đang có 2 lớp đang học, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ rút khỏi lớp, rút khỏi giải."
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
  if (effects.withdrawFromClasses && impact.activeClasses > 0) {
    facts.push(`${impact.activeClasses} lớp đang học`);
    actions.push('rút khỏi lớp');
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
  if (effects.settleMedicalWork && impact.examRequestsToDismiss > 0) {
    facts.push(`${impact.examRequestsToDismiss} yêu cầu khám đang chờ`);
    actions.push('bỏ qua yêu cầu khám');
  }
  if (effects.settleMedicalWork && impact.careSchedulesToCancel > 0) {
    facts.push(
      `${impact.careSchedulesToCancel} lịch hẹn khám hoặc lịch chăm sóc chưa làm`,
    );
    actions.push('hủy các lịch đó');
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
 * Lấy field sở trường cự ly (raceAptitude) trong các field gửi lên
 *
 * - Chỉ Head Trainer phụ trách khu được sửa field này, Club Manager không được sửa
 * - Field có giá trị undefined được coi là không gửi lên
 *
 * @param fields Các field hồ sơ ngựa người gọi gửi lên, không gồm version
 * @returns ['raceAptitude'] nếu có gửi, rỗng nếu không
 */
export function raceAptitudeFieldsIn(fields: object): string[] {
  return Object.entries(fields)
    .filter(
      ([key, value]) => value !== undefined && key === RACE_APTITUDE_FIELD,
    )
    .map(([key]) => key);
}

/**
 * Lấy các field khác sở trường cự ly (raceAptitude) trong các field gửi lên
 *
 * - Chỉ Club Manager được sửa các field này, Head Trainer chỉ được sửa raceAptitude
 * - Field có giá trị undefined được coi là không gửi lên
 *
 * @param fields Các field hồ sơ ngựa người gọi gửi lên, không gồm version
 * @returns Tên các field đã gửi khác raceAptitude, rỗng nếu không có
 */
export function nonRaceAptitudeFieldsIn(fields: object): string[] {
  return Object.entries(fields)
    .filter(
      ([key, value]) => value !== undefined && key !== RACE_APTITUDE_FIELD,
    )
    .map(([key]) => key);
}

/**
 * Tính "được tập" và "được đua" của ngựa kèm mọi lý do chặn; không lưu DB, tính lại mỗi lần gọi
 *
 * - Được tập: hồ sơ chưa xóa, vòng đời ACTIVE, sức khỏe ELIGIBLE hoặc UNDER_OBSERVATION, không có lệnh khóa huấn luyện
 * - Được đua: hồ sơ chưa xóa, vòng đời ACTIVE, sức khỏe ELIGIBLE, không có lệnh khóa huấn luyện
 * - Lý do vòng đời tách riêng Đã giải nghệ (LIFECYCLE_RETIRED), Đã chuyển nhượng (LIFECYCLE_TRANSFERRED) và Đã mất (LIFECYCLE_DECEASED)
 * - trainingReasons: lý do không được tập, rỗng khi được tập
 * - racingReasons: lý do không được đua, rỗng khi được đua
 * - reasons: mọi lý do, bằng racingReasons
 *
 * @param input Trạng thái hồ sơ, vòng đời, sức khỏe và cờ khóa huấn luyện của ngựa
 * @returns Hai cờ được tập, được đua và lý do chặn của từng cờ (rỗng nếu không bị chặn gì)
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
  if (input.lifecycleStatus === HorseLifecycleStatus.DECEASED) {
    reasons.push(EligibilityReason.LIFECYCLE_DECEASED);
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

  const trainingReasons = reasons.filter(
    (reason) => reason !== EligibilityReason.HEALTH_UNDER_OBSERVATION,
  );

  return {
    trainingEligible: active && trainableHealth && !input.hasActiveTrainingLock,
    racingEligible:
      active &&
      input.healthStatus === HorseHealthStatus.ELIGIBLE &&
      !input.hasActiveTrainingLock,
    trainingReasons,
    racingReasons: reasons,
    reasons,
  };
}

/**
 * Chặn giá trị đo nằm ngoài khoảng cho phép của loại chỉ số
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
 * Chặn một lần đo ghi trùng loại chỉ số
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
 * Kiểm tra giá trị có nằm ngoài khoảng bình thường của loại chỉ số không
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
 * Chặn xóa bản ghi đo đến từ buổi khám; bản ghi đó chỉ xử lý ở hồ sơ y tế
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
 * Bắt người ghi xác nhận trước khi lưu giá trị ngoài khoảng bình thường
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
 * Tính các cảnh báo tự động cho một lần ghi chỉ số
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
  const earliest = now.getTime() - MEASUREMENT_BACKDATE_MAX_DAYS * MS_PER_DAY;
  if (measuredAt.getTime() < earliest) {
    throw new BadRequestException(
      `Chỉ được nhập lùi tối đa ${MEASUREMENT_BACKDATE_MAX_DAYS} ngày`,
    );
  }
}

/**
 * Kiểm tra người gọi có được ghi chỉ số cơ thể cho con ngựa không; ai được ghi thì ghi được cả bốn loại
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
 * Tính tình trạng xếp chỗ của ngựa: Chờ xếp khu, Chờ xếp ô hoặc đã xếp
 *
 * @param lifecycleStatus Vòng đời của ngựa
 * @param barnId Khu của ngựa, null nếu chưa xếp
 * @param stallId Ô đang mở của ngựa, null nếu chưa xếp
 * @returns Tình trạng xếp chỗ; ngựa đã chuyển nhượng hoặc đã mất luôn là NOT_APPLICABLE
 */
export function placementStatusOf(
  lifecycleStatus: HorseLifecycleStatus,
  barnId: string | null,
  stallId: string | null,
): HorsePlacementStatus {
  if (isReadOnlyLifecycle(lifecycleStatus)) {
    return HorsePlacementStatus.NOT_APPLICABLE;
  }
  if (!barnId) return HorsePlacementStatus.PENDING_BARN;
  if (!stallId) return HorsePlacementStatus.PENDING_STALL;
  return HorsePlacementStatus.PLACED;
}

/**
 * Tính các cờ quyền của người gọi trên hồ sơ ngựa, khớp với kiểm tra của từng API ghi
 *
 * - Hồ sơ đã xóa: chỉ còn Club Manager khôi phục được, mọi thao tác khác tắt.
 * - Ngựa đã chuyển nhượng: hồ sơ chỉ đọc, chỉ còn Club Manager đổi được vòng đời để kích hoạt lại.
 * - Ngựa đã mất: hồ sơ chỉ đọc, không đổi được vòng đời.
 * - Head Trainer chỉ thao tác ngựa thuộc khu mình; ngựa chưa có khu thì Head Trainer không thao tác được.
 * - Xem bệnh án, huấn luyện: mọi vai trò trừ Groom. Xem thành tích: Club Manager, Head Trainer, Horse Owner.
 * - Người có nhiều role: chỉ cần một role được phép là cờ bật.
 *
 * @param input Role của người gọi và trạng thái của ngựa
 * @returns Các cờ quyền
 */
export function evaluateHorsePermissions(
  input: HorsePermissionInput,
): HorsePermissions {
  const has = (...roles: UserRole[]) =>
    roles.some((role) => input.roles.includes(role));
  const live = !input.isDeleted;
  const writable = live && !isReadOnlyLifecycle(input.lifecycleStatus);
  const trainerInBarn = has(UserRole.HEAD_TRAINER) && input.isInTrainerBarn;

  return {
    canEditProfile: has(UserRole.CLUB_MANAGER) && writable,
    canEditRaceAptitude: trainerInBarn && writable,
    canAssignBarn: has(UserRole.CLUB_MANAGER) && writable,
    canAssignStallAndGroom: trainerInBarn && input.hasBarn && writable,
    canChangeLifecycle:
      has(UserRole.CLUB_MANAGER) &&
      live &&
      input.lifecycleStatus !== HorseLifecycleStatus.DECEASED,
    canDelete: has(UserRole.CLUB_MANAGER) && writable,
    canRestore: has(UserRole.CLUB_MANAGER) && input.isDeleted,
    canChangeHealth: has(UserRole.VETERINARIAN) && writable,
    canRecordMeasurement: writable && canRecordMeasurement(input),
    canDeleteMeasurement: has(UserRole.VETERINARIAN) && live,
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

/**
 * Chặn khoảng thời gian lọc bị ngược
 *
 * @param from Thời điểm bắt đầu, bỏ trống nếu không lọc
 * @param to Thời điểm kết thúc, bỏ trống nếu không lọc
 * @throws BadRequestException Nếu from sau to
 */
export function assertTimeRange(from?: Date, to?: Date): void {
  if (from && to && from > to) {
    throw new BadRequestException('from phải trước hoặc bằng to');
  }
}

/**
 * Lý do không đổi được khu khi xem trước
 *
 * @param lifecycleStatus Trạng thái vòng đời hiện tại của ngựa
 * @param currentBarnId Khu hiện tại, null nếu chưa có
 * @param targetBarnId Khu muốn chuyển sang
 * @returns Lý do chặn, null nếu đổi được
 */
export function barnChangeBlockedReason(
  lifecycleStatus: HorseLifecycleStatus,
  currentBarnId: string | null,
  targetBarnId: string,
): string | null {
  if (isReadOnlyLifecycle(lifecycleStatus)) {
    return BARN_CHANGE_READ_ONLY_REASONS[lifecycleStatus];
  }
  if (currentBarnId === targetBarnId) return 'Ngựa đang ở khu này';
  return null;
}

/**
 * Tạo câu tóm tắt hệ quả khi đổi khu
 *
 * - Chỉ nhắc mục thật sự có dữ liệu; Groom luôn được giữ nguyên
 * - Có ô phải trả hoặc lớp phải rút: "Nếu chuyển Winx sang Khu C sẽ trả ô A-01 và rút khỏi 2 lớp. Groom Lan giữ nguyên. Ngựa vào danh sách Chờ xếp ô của Huấn luyện viên trưởng Hoa."
 * - Không có: "Nếu chuyển Winx sang Khu C, ngựa vào danh sách Chờ xếp ô của khu mới."
 *
 * @param horseName Tên ngựa
 * @param barnName Tên khu đích
 * @param headTrainerName Tên Huấn luyện viên trưởng khu đích, null nếu chưa có
 * @param impact Ô, Groom và số lớp sẽ bị ảnh hưởng
 * @returns Câu tóm tắt tiếng Việt
 */
export function barnChangeSummary(
  horseName: string,
  barnName: string,
  headTrainerName: string | null,
  impact: BarnChangeImpactRow,
): string {
  const actions: string[] = [];
  if (impact.stallCode) actions.push(`trả ô ${impact.stallCode}`);
  if (impact.classesToWithdraw > 0) {
    actions.push(`rút khỏi ${impact.classesToWithdraw} lớp`);
  }
  const head = `Nếu chuyển ${horseName} sang ${barnName}`;
  const pending = headTrainerName
    ? `danh sách Chờ xếp ô của Huấn luyện viên trưởng ${headTrainerName}`
    : 'danh sách Chờ xếp ô của khu mới';
  const groom = impact.groomName
    ? ` Groom ${impact.groomName} giữ nguyên.`
    : '';
  if (actions.length === 0) return `${head}, ngựa vào ${pending}.${groom}`;
  return `${head} sẽ ${actions.join(' và ')}.${groom} Ngựa vào ${pending}.`;
}

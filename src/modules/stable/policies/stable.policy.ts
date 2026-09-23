import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import type { HorseEntity } from '../../horses/entities/horse.entity';
import type { UserEntity } from '../../users/entities/user.entity';
import { BarnStatus } from '../constants/barn-status.enum';
import {
  MANUAL_STALL_STATUSES,
  StallStatus,
} from '../constants/stall-status.enum';
import type { BarnEntity } from '../entities/barn.entity';
import type {
  BarnChange,
  BarnStallCapacity,
  StableHorseOperation,
} from '../types/stable.types';

/**
 * Số ô trống và số ngựa chờ xếp ô của khu không có trong kết quả đếm (khu không tồn tại)
 */
export const EMPTY_CAPACITY: BarnStallCapacity = {
  freeStallCount: 0,
  pendingStallHorseCount: 0,
};

/**
 * Câu báo 409 khi ngựa đã chuyển nhượng, theo từng thao tác của Head Trainer
 */
const TRANSFERRED_HORSE_MESSAGES: Record<StableHorseOperation, string> = {
  STALL: 'Ngựa đã chuyển nhượng, không xếp ô chuồng được',
  GROOM: 'Ngựa đã chuyển nhượng, không giao groom được',
};

/**
 * Các trạng thái khu không nhận ngựa; khu còn ngựa thì không được chuyển sang
 */
const HORSE_BLOCKING_BARN_STATUSES: readonly BarnStatus[] = [
  BarnStatus.CLOSED,
  BarnStatus.MAINTENANCE,
];

/**
 * Tính số chỗ khu còn nhận được ngựa mới
 *
 * @param capacity Số ô trống và số ngựa chờ xếp ô của khu
 * @returns Số ô trống trừ số ngựa chờ xếp ô, không nhỏ hơn 0
 */
export function remainingStallCount(capacity: BarnStallCapacity): number {
  return Math.max(0, capacity.freeStallCount - capacity.pendingStallHorseCount);
}

/**
 * Dựng câu báo 409 khi khu hết chỗ nhận ngựa
 *
 * - Không có ngựa chờ xếp ô: báo hết ô trống
 * - Có ngựa chờ xếp ô: nói rõ số ô trống và số ngựa đang chờ
 *
 * @param capacity Số ô trống và số ngựa chờ xếp ô của khu
 * @returns Câu báo tiếng Việt trả cho client
 */
export function fullBarnMessage(capacity: BarnStallCapacity): string {
  if (capacity.pendingStallHorseCount === 0) {
    return 'Khu chuồng đã hết ô trống, vui lòng chọn khu khác';
  }
  return `Khu chuồng đã hết chỗ: ${capacity.freeStallCount} ô trống nhưng đã có ${capacity.pendingStallHorseCount} ngựa chờ xếp ô, vui lòng chọn khu khác`;
}

/**
 * Kiểm tra user phụ trách khu có còn là Head Trainer đang hoạt động không
 *
 * @param user User phụ trách khu (quan hệ headTrainer đã nạp), null nếu khu chưa có hoặc user đã bị xóa
 * @returns true nếu user tồn tại, đang ACTIVE và có vai trò HEAD_TRAINER
 */
export function isActiveHeadTrainer(
  user: Pick<UserEntity, 'role' | 'status'> | null,
): boolean {
  return (
    user !== null &&
    user.status === UserStatus.ACTIVE &&
    user.role === UserRole.HEAD_TRAINER
  );
}

/**
 * Kiểm tra ô chuồng có đang trống để xếp ngựa vào không
 *
 * @param status Trạng thái hiện tại của ô
 * @param hasOpenAssignment true nếu ô đang có phân công chưa kết thúc
 * @returns true nếu ô đang AVAILABLE và không có phân công đang mở
 */
export function isStallFree(
  status: StallStatus,
  hasOpenAssignment: boolean,
): boolean {
  return status === StallStatus.AVAILABLE && !hasOpenAssignment;
}

/**
 * Chặn thao tác trên ngựa chưa được Club Manager xếp khu
 *
 * @param horse Con ngựa cần kiểm
 * @returns UUID khu của ngựa
 * @throws ConflictException Nếu ngựa chưa được xếp khu
 */
export function assertHorseHasBarn(horse: Pick<HorseEntity, 'barnId'>): string {
  if (horse.barnId === null) {
    throw new ConflictException(
      'Ngựa chưa được xếp khu chuồng, vui lòng liên hệ Club Manager để xếp khu trước',
    );
  }
  return horse.barnId;
}

/**
 * Chặn Head Trainer thao tác trên ngựa ngoài khu mình phụ trách
 *
 * @param isInTrainerBarn true nếu ngựa thuộc khu người gọi phụ trách
 * @throws ForbiddenException Nếu ngựa không thuộc khu người gọi phụ trách
 */
export function assertHorseInTrainerBarn(isInTrainerBarn: boolean): void {
  if (!isInTrainerBarn) {
    throw new ForbiddenException('Ngựa không thuộc khu bạn phụ trách');
  }
}

/**
 * Chặn xếp ô hoặc giao groom cho ngựa đã chuyển nhượng. Ngựa đã giải nghệ vẫn được
 *
 * @param horse Con ngựa cần kiểm
 * @param operation Thao tác đang làm, để chọn câu báo lỗi
 * @throws ConflictException Nếu ngựa đã chuyển nhượng
 */
export function assertHorseNotTransferred(
  horse: Pick<HorseEntity, 'lifecycleStatus'>,
  operation: StableHorseOperation,
): void {
  if (horse.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
    throw new ConflictException(TRANSFERRED_HORSE_MESSAGES[operation]);
  }
}

/**
 * Chặn thao tác trên khu chuồng không ở trạng thái ACTIVE
 *
 * @param barn Khu chuồng cần kiểm
 * @param label Cách gọi khu trong câu báo lỗi (vd "Khu chuồng", "Khu chuồng đích")
 * @throws BadRequestException Nếu khu không ở trạng thái ACTIVE
 */
export function assertBarnActive(
  barn: Pick<BarnEntity, 'status'>,
  label = 'Khu chuồng',
): void {
  if (barn.status !== BarnStatus.ACTIVE) {
    throw new BadRequestException(`${label} không ở trạng thái hoạt động`);
  }
}

/**
 * Chặn thêm ô vào khu đã đủ sức chứa. Khu không đặt sức chứa (null) thì không giới hạn
 *
 * @param barn Khu chuồng nhận ô
 * @param stallCount Số ô hiện có của khu (chưa xóa)
 * @param label Cách gọi khu trong câu báo lỗi (vd "Khu chuồng", "Khu chuồng đích")
 * @throws ConflictException Nếu số ô hiện có đã bằng hoặc vượt sức chứa
 */
export function assertBarnHasStallRoom(
  barn: Pick<BarnEntity, 'capacity'>,
  stallCount: number,
  label = 'Khu chuồng',
): void {
  if (barn.capacity !== null && stallCount >= barn.capacity) {
    throw new ConflictException(
      `${label} đã đạt sức chứa tối đa (${barn.capacity} ô chuồng)`,
    );
  }
}

/**
 * Chặn đổi khu của ô chuồng đang có ngựa
 *
 * @param hasOpenAssignment true nếu ô đang có phân công chưa kết thúc
 * @throws ConflictException Nếu ô đang có ngựa
 */
export function assertStallBarnChangeable(hasOpenAssignment: boolean): void {
  if (hasOpenAssignment) {
    throw new ConflictException(
      'Ô chuồng đang có ngựa, không đổi khu chuồng được',
    );
  }
}

/**
 * Kiểm luật Club Manager tự đổi trạng thái ô (chỉ AVAILABLE ↔ MAINTENANCE)
 *
 * - Ô đang có ngựa thì không đổi được, trạng thái do xếp hoặc gỡ ngựa quyết
 * - Ô đang ở trạng thái khác AVAILABLE, MAINTENANCE (vd OCCUPIED) thì không đổi tay được
 *
 * @param currentStatus Trạng thái hiện tại của ô
 * @param hasOpenAssignment true nếu ô đang có phân công chưa kết thúc
 * @throws ConflictException Nếu ô đang có ngựa hoặc trạng thái hiện tại không đổi tay được
 */
export function assertManualStallStatusChange(
  currentStatus: StallStatus,
  hasOpenAssignment: boolean,
): void {
  if (hasOpenAssignment) {
    throw new ConflictException(
      'Ô chuồng đang có ngựa, không đổi trạng thái được',
    );
  }
  if (
    !(MANUAL_STALL_STATUSES as readonly StallStatus[]).includes(currentStatus)
  ) {
    throw new ConflictException(
      `Ô chuồng đang ${currentStatus}, chỉ được đổi giữa AVAILABLE và MAINTENANCE`,
    );
  }
}

/**
 * Chặn đưa một ô trống ra khỏi danh sách ô trống (xóa ô, chuyển ô sang MAINTENANCE) khi khu không còn đủ ô cho ngựa đang chờ xếp ô
 *
 * - Chỉ gọi khi ô đang trống (AVAILABLE, không có phân công đang mở), nên ô này đang được tính trong freeStallCount
 * - Sau khi bỏ ô này, số ô trống còn lại (freeStallCount − 1) phải lớn hơn hoặc bằng số ngựa chờ xếp ô
 *
 * @param capacity Số ô trống (tính cả ô sắp bỏ) và số ngựa chờ xếp ô của khu, đếm sau khi đã lock khu
 * @throws ConflictException Nếu bỏ ô này thì số ô trống còn lại ít hơn số ngựa chờ xếp ô
 */
export function assertFreeStallRemovable(capacity: BarnStallCapacity): void {
  if (capacity.freeStallCount - 1 < capacity.pendingStallHorseCount) {
    throw new ConflictException(
      `Khu còn ${capacity.pendingStallHorseCount} ngựa chờ xếp ô, không đưa ô này ra khỏi danh sách ô trống được. Vui lòng xếp ô cho ngựa hoặc chuyển ngựa sang khu khác trước`,
    );
  }
}

/**
 * Chặn giao việc cho user không phải Groom đang hoạt động
 *
 * @param user User được chọn làm groom (đã lock), null nếu không có hoặc đã xóa
 * @throws BadRequestException Nếu user không có, không phải GROOM hoặc không ACTIVE
 */
export function assertAssignableGroom<
  T extends Pick<UserEntity, 'role' | 'status'>,
>(user: T | null): asserts user is T {
  if (
    user === null ||
    user.role !== UserRole.GROOM ||
    user.status !== UserStatus.ACTIVE
  ) {
    throw new BadRequestException(
      'Groom phụ trách không hợp lệ hoặc không ở trạng thái hoạt động',
    );
  }
}

/**
 * Chặn các thay đổi làm khu còn ngựa mất chỗ ở hoặc mất người phụ trách (F1.6)
 *
 * - Khu không còn ngựa: cho qua mọi thay đổi
 * - Chuyển status sang CLOSED hoặc MAINTENANCE: chặn
 * - Gỡ Head Trainer (null) khi khu đang có người phụ trách: chặn
 * - Luật sức chứa áp cho mọi khu nên nằm riêng ở assertCapacityFitsStalls
 *
 * @param change Trạng thái hiện tại và giá trị mới của khu
 * @throws ConflictException Nếu khu còn ngựa và thay đổi thuộc một trong các trường hợp bị chặn
 */
export function assertBarnChangeKeepsHorses(change: BarnChange): void {
  if (!change.hasHorses) return;
  if (
    change.nextStatus !== undefined &&
    change.nextStatus !== change.currentStatus &&
    HORSE_BLOCKING_BARN_STATUSES.includes(change.nextStatus)
  ) {
    throw new ConflictException(
      `Khu chuồng còn ngựa, không chuyển sang ${change.nextStatus} được. Vui lòng chuyển ngựa sang khu khác trước`,
    );
  }
  if (
    change.nextHeadTrainerId === null &&
    change.currentHeadTrainerId !== null
  ) {
    throw new ConflictException(
      'Khu chuồng còn ngựa, không gỡ Head Trainer phụ trách được',
    );
  }
}

/**
 * Chặn hạ sức chứa của khu xuống dưới số ô đang có, áp cho mọi khu dù còn ngựa hay không (quyết định 2026-09-23)
 *
 * - capacity là số ô tối đa của khu; nhỏ hơn số ô hiện có thì dữ liệu tự mâu thuẫn
 * - Không gửi capacity (undefined) hoặc bỏ giới hạn (null) thì cho qua
 * - Muốn hạ thì xóa bớt ô trước
 *
 * @param stallCount Số ô chưa xóa của khu
 * @param nextCapacity Sức chứa mới, undefined nếu không đổi, null nếu bỏ giới hạn
 * @throws ConflictException Nếu sức chứa mới nhỏ hơn số ô hiện có
 */
export function assertCapacityFitsStalls(
  stallCount: number,
  nextCapacity: number | null | undefined,
): void {
  if (
    nextCapacity !== undefined &&
    nextCapacity !== null &&
    nextCapacity < stallCount
  ) {
    throw new ConflictException(
      `Khu chuồng đang có ${stallCount} ô chuồng, không hạ sức chứa xuống ${nextCapacity} được. Vui lòng xóa bớt ô trước`,
    );
  }
}

/**
 * Chặn xóa khu chuồng còn ngựa hoặc còn ô chuồng
 *
 * @param hasHorses true nếu khu còn ngựa (horses.barn_id, hồ sơ chưa xóa)
 * @param hasStalls true nếu khu còn ô chuồng chưa xóa
 * @throws ConflictException Nếu khu còn ngựa hoặc còn ô chuồng
 */
export function assertBarnRemovable(
  hasHorses: boolean,
  hasStalls: boolean,
): void {
  if (hasHorses) {
    throw new ConflictException('Không thể xóa khu chuồng khi vẫn còn ngựa');
  }
  if (hasStalls) {
    throw new ConflictException(
      'Không thể xóa khu chuồng khi vẫn còn ô chuồng bên trong',
    );
  }
}

/**
 * Lọc ra các field có giá trị mới khác giá trị đang lưu, kèm giá trị cũ để ghi nhật ký
 *
 * - Field có giá trị undefined được coi là không gửi lên, bỏ qua
 * - So sánh bằng ===, chỉ dùng cho giá trị đơn (string, number, enum, null)
 *
 * @param current Bản ghi đang lưu
 * @param next Các giá trị mới người gọi gửi lên
 * @returns Cặp before/after chỉ gồm các field thực sự đổi, hoặc null nếu không field nào đổi
 */
export function changedFieldsDiff<T extends object>(
  current: T,
  next: Partial<T>,
): { before: Partial<T>; after: Partial<T> } | null {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (next[key] !== undefined && next[key] !== current[key]) {
      before[key] = current[key];
      after[key] = next[key];
    }
  }
  return Object.keys(after).length === 0 ? null : { before, after };
}

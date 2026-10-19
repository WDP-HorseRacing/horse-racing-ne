import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { shiftDays } from '../../../common/utils/club-date';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import type { HorseEntity } from '../../horses/entities/horse.entity';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';
import { HorseCareTaskMode } from '../constants/horse-care-task-mode.enum';
import { assertHorseHasBarn, assertHorseInTrainerBarn } from './stable.policy';

const MAX_CARE_TASK_DAYS = 366;
const MAX_CHECKLIST_RANGE_DAYS = 31;

/**
 * Cách gỡ một việc riêng của ngựa theo hôm nay
 *
 * - DELETE: chưa tới ngày bắt đầu (dòng miễn: chưa qua ngày bắt đầu), xóa hẳn
 * - END_TODAY: việc gắn thêm đang hiệu lực, kết thúc ở hôm nay
 * - END_YESTERDAY: dòng miễn đã bắt đầu từ trước hôm nay, kết thúc ở hôm qua để việc chung có lại từ hôm nay
 */
export type CareTaskRemoval = 'DELETE' | 'END_TODAY' | 'END_YESTERDAY';

/**
 * Tính trạng thái checklist trong ngày từ số việc đã xong
 *
 * @param doneCount Số việc đã xong
 * @param total Tổng số việc
 * @returns PENDING khi chưa xong việc nào, COMPLETED khi xong hết, còn lại IN_PROGRESS
 */
export function checklistStatusOf(
  doneCount: number,
  total: number,
): DailyChecklistStatus {
  if (doneCount === 0) return DailyChecklistStatus.PENDING;
  if (doneCount >= total) return DailyChecklistStatus.COMPLETED;
  return DailyChecklistStatus.IN_PROGRESS;
}

/**
 * Kiểm khoảng ngày xem checklist: đến ngày không trước từ ngày, dài tối đa 31 ngày
 *
 * @param from Từ ngày, YYYY-MM-DD
 * @param to Đến ngày, YYYY-MM-DD
 * @throws BadRequestException Nếu đến ngày trước từ ngày hoặc khoảng dài quá 31 ngày
 */
export function assertChecklistRange(from: string, to: string): void {
  if (to < from) {
    throw new BadRequestException('Đến ngày phải từ ngày bắt đầu trở đi');
  }
  if (to > shiftDays(from, MAX_CHECKLIST_RANGE_DAYS - 1)) {
    throw new BadRequestException(
      `Chỉ xem tối đa ${MAX_CHECKLIST_RANGE_DAYS} ngày một lần`,
    );
  }
}

/**
 * Bắt buộc người tick là Groom đang giữ checklist
 *
 * @param checklistGroomId UUID Groom của checklist
 * @param callerId UUID người gọi
 * @throws ForbiddenException Nếu checklist không giao cho người gọi
 */
export function assertChecklistGroom(
  checklistGroomId: string,
  callerId: string,
): void {
  if (checklistGroomId !== callerId) {
    throw new ForbiddenException('Checklist này không giao cho bạn');
  }
}

/**
 * Bắt buộc checklist là của hôm nay trước khi ghi
 *
 * @param checklistDate Ngày của checklist, YYYY-MM-DD
 * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
 * @throws ConflictException Nếu checklist không phải của hôm nay
 */
export function assertChecklistToday(
  checklistDate: string,
  today: string,
): void {
  if (checklistDate !== today) {
    throw new ConflictException('Chỉ sửa được checklist của hôm nay');
  }
}

/**
 * Chặn ghi lên checklist đã hủy
 *
 * @param status Trạng thái checklist
 * @throws ConflictException Nếu checklist đã hủy vì ngựa đã chuyển nhượng hoặc đã mất
 */
export function assertChecklistNotCancelled(
  status: DailyChecklistStatus,
): void {
  if (status === DailyChecklistStatus.CANCELLED) {
    throw new ConflictException(
      'Checklist đã hủy vì ngựa đã chuyển nhượng hoặc đã mất, không sửa được',
    );
  }
}

/**
 * Kiểm khoảng ngày của việc riêng: bắt đầu từ hôm nay, kết thúc không trước ngày bắt đầu, dài tối đa 366 ngày
 *
 * @param fromDate Ngày bắt đầu, YYYY-MM-DD
 * @param toDate Ngày kết thúc, YYYY-MM-DD
 * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
 * @throws BadRequestException Nếu ngày bắt đầu ở quá khứ, ngày kết thúc trước ngày bắt đầu, hoặc khoảng dài quá 366 ngày
 */
export function assertCareTaskRange(
  fromDate: string,
  toDate: string,
  today: string,
): void {
  if (fromDate < today) {
    throw new BadRequestException('Ngày bắt đầu không được ở quá khứ');
  }
  if (toDate < fromDate) {
    throw new BadRequestException('Ngày kết thúc phải từ ngày bắt đầu trở đi');
  }
  if (toDate > shiftDays(fromDate, MAX_CARE_TASK_DAYS - 1)) {
    throw new BadRequestException(
      `Việc riêng kéo dài tối đa ${MAX_CARE_TASK_DAYS} ngày`,
    );
  }
}

/**
 * Kiểm loại việc có gắn riêng cho một ngựa được theo kiểu dòng không
 *
 * - Loại việc đã ngưng: không gắn thêm, không miễn
 * - Gắn thêm (EXTRA): chỉ loại việc không áp mọi ngựa
 * - Miễn (EXEMPT): chỉ loại việc đang áp mọi ngựa
 *
 * @param type Tên, trạng thái dùng và cờ áp mọi ngựa của loại việc
 * @param mode Kiểu dòng việc riêng
 * @throws ConflictException Nếu loại việc đã ngưng, gắn thêm loại đã áp mọi ngựa, hoặc miễn loại không áp mọi ngựa
 */
export function assertAssignableCareTaskType(
  type: {
    name: string;
    active: boolean;
    appliesToAll: boolean;
  },
  mode: HorseCareTaskMode,
): void {
  if (!type.active) {
    throw new ConflictException(`Loại việc ${type.name} đã ngưng dùng`);
  }
  if (mode === HorseCareTaskMode.EXTRA && type.appliesToAll) {
    throw new ConflictException(
      `Loại việc ${type.name} đã áp cho mọi ngựa, không cần gắn riêng`,
    );
  }
  if (mode === HorseCareTaskMode.EXEMPT && !type.appliesToAll) {
    throw new ConflictException(
      `Loại việc ${type.name} không áp cho mọi ngựa, không cần miễn`,
    );
  }
}

/**
 * Bắt buộc ghi lý do khi miễn việc chung cho một ngựa
 *
 * @param mode Kiểu dòng việc riêng
 * @param note Ghi chú đã cắt khoảng trắng, null nếu bỏ trống
 * @throws BadRequestException Nếu miễn việc mà không có lý do (lỗi gắn ô note)
 */
export function assertExemptionReason(
  mode: HorseCareTaskMode,
  note: string | null,
): void {
  if (mode === HorseCareTaskMode.EXEMPT && !note) {
    throw fieldBadRequest('note', 'Miễn việc phải ghi lý do');
  }
}

/**
 * Chặn đổi cờ áp mọi ngựa của loại việc khi còn dòng gắn thêm hoặc miễn chưa hết hạn
 *
 * @param changing Cờ áp mọi ngựa đổi giá trị
 * @param hasOpenHorseTasks Còn dòng việc riêng của loại này có ngày kết thúc từ hôm nay trở đi
 * @throws ConflictException Nếu đổi cờ khi còn dòng chưa hết hạn
 */
export function assertAppliesToAllChangeable(
  changing: boolean,
  hasOpenHorseTasks: boolean,
): void {
  if (changing && hasOpenHorseTasks) {
    throw new ConflictException(
      'Loại việc còn ngựa được gắn thêm hoặc được miễn chưa hết hạn, gỡ các dòng đó trước khi đổi cờ áp mọi ngựa',
    );
  }
}

/**
 * Chặn gắn trùng một loại việc cho cùng ngựa trong khoảng ngày chồng nhau
 *
 * @param overlapping Đã có việc riêng cùng loại chồng khoảng ngày
 * @throws ConflictException Nếu khoảng ngày chồng nhau
 */
export function assertNoOverlappingCareTask(overlapping: boolean): void {
  if (overlapping) {
    throw new ConflictException(
      'Ngựa đã được gắn việc này trong khoảng ngày chồng nhau',
    );
  }
}

/**
 * Chặn người gọi gắn, miễn hoặc gỡ việc riêng của ngựa ngoài phạm vi của mình
 *
 * - Veterinarian: mọi ngựa trong CLB, kể cả ngựa chưa có khu
 * - Head Trainer: ngựa đã có khu và thuộc khu mình phụ trách
 * - Vai trò khác: 403
 *
 * @param roles Vai trò của người gọi
 * @param horse Con ngựa cần kiểm
 * @param inTrainerBarn true nếu ngựa thuộc khu người gọi phụ trách
 * @throws ForbiddenException Nếu người gọi không phải Veterinarian hay Head Trainer, hoặc Head Trainer đổi ngựa ngoài khu mình
 * @throws ConflictException Nếu Head Trainer đổi ngựa chưa được xếp khu
 */
export function assertCareTaskWriter(
  roles: readonly UserRole[],
  horse: Pick<HorseEntity, 'barnId'>,
  inTrainerBarn: boolean,
): void {
  if (roles.includes(UserRole.VETERINARIAN)) return;
  if (!roles.includes(UserRole.HEAD_TRAINER)) {
    throw new ForbiddenException(
      'Chỉ Bác sĩ thú y hoặc Huấn luyện viên trưởng của khu được đổi việc riêng của ngựa',
    );
  }
  assertHorseHasBarn(horse);
  assertHorseInTrainerBarn(inTrainerBarn);
}

/**
 * Chọn cách gỡ việc riêng theo hôm nay và kiểu dòng
 *
 * - Gắn thêm: chưa bắt đầu thì xóa, đang hiệu lực thì kết thúc ở hôm nay
 * - Miễn: bắt đầu từ hôm nay trở đi thì xóa, bắt đầu trước hôm nay thì kết thúc ở hôm qua
 *
 * @param mode Kiểu dòng việc riêng
 * @param fromDate Ngày bắt đầu, YYYY-MM-DD
 * @param toDate Ngày kết thúc, YYYY-MM-DD
 * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
 * @returns Cách gỡ
 * @throws ConflictException Nếu việc đã kết thúc trước hôm nay
 */
export function careTaskRemovalOf(
  mode: HorseCareTaskMode,
  fromDate: string,
  toDate: string,
  today: string,
): CareTaskRemoval {
  if (toDate < today) {
    throw new ConflictException('Việc riêng đã kết thúc, không gỡ được');
  }
  if (mode === HorseCareTaskMode.EXEMPT) {
    return fromDate >= today ? 'DELETE' : 'END_YESTERDAY';
  }
  return fromDate > today ? 'DELETE' : 'END_TODAY';
}

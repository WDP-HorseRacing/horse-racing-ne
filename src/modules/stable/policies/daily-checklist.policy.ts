import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { shiftDays } from '../../../common/utils/club-date';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';

const MAX_CARE_TASK_DAYS = 366;
const MAX_CHECKLIST_RANGE_DAYS = 31;

/**
 * Cách gỡ một việc riêng của ngựa theo hôm nay
 *
 * - DELETE: chưa tới ngày bắt đầu, xóa hẳn
 * - END_TODAY: đang hiệu lực, kết thúc ở hôm nay
 */
export type CareTaskRemoval = 'DELETE' | 'END_TODAY';

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
 * Bắt buộc loại việc còn dùng và chưa áp cho mọi ngựa trước khi gắn riêng cho một ngựa
 *
 * @param type Trạng thái dùng và cờ áp mọi ngựa của loại việc
 * @throws ConflictException Nếu loại việc đã ngưng hoặc đã áp cho mọi ngựa
 */
export function assertAssignableCareTaskType(type: {
  name: string;
  active: boolean;
  appliesToAll: boolean;
}): void {
  if (!type.active) {
    throw new ConflictException(`Loại việc ${type.name} đã ngưng dùng`);
  }
  if (type.appliesToAll) {
    throw new ConflictException(
      `Loại việc ${type.name} đã áp cho mọi ngựa, không cần gắn riêng`,
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
 * Chọn cách gỡ việc riêng theo hôm nay
 *
 * @param fromDate Ngày bắt đầu, YYYY-MM-DD
 * @param toDate Ngày kết thúc, YYYY-MM-DD
 * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
 * @returns DELETE nếu chưa bắt đầu, END_TODAY nếu đang hiệu lực
 * @throws ConflictException Nếu việc đã kết thúc trước hôm nay
 */
export function careTaskRemovalOf(
  fromDate: string,
  toDate: string,
  today: string,
): CareTaskRemoval {
  if (fromDate > today) return 'DELETE';
  if (toDate >= today) return 'END_TODAY';
  throw new ConflictException('Việc riêng đã kết thúc, không gỡ được');
}

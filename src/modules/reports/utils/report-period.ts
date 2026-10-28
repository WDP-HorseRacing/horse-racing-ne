import { BadRequestException } from '@nestjs/common';
import {
  clubDateTimeToInstant,
  shiftDays,
} from '../../../common/utils/club-date';
import type { ReportPeriodDto } from '../dto/report-period.dto';
import type { ReportPeriod } from '../types/report.types';

const DEFAULT_PERIOD_DAYS = 30;

/**
 * Chốt khoảng ngày của báo cáo theo lịch CLB
 *
 * - Bỏ trống to: là hôm nay
 * - Bỏ trống from: lấy trọn 30 ngày tính tới to
 *
 * @param query Từ ngày, tới ngày người gọi gửi lên
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @returns Khoảng ngày cùng mốc bắt đầu và mốc kết thúc (không lấy) để truy vấn
 * @throws BadRequestException Nếu từ ngày sau tới ngày
 */
export function resolveReportPeriod(
  query: ReportPeriodDto,
  today: string,
): ReportPeriod {
  const to = query.to ?? today;
  const from = query.from ?? shiftDays(to, 1 - DEFAULT_PERIOD_DAYS);
  if (from > to) {
    throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  }
  return {
    from,
    to,
    start: clubDateTimeToInstant(from, '00:00'),
    end: clubDateTimeToInstant(shiftDays(to, 1), '00:00'),
  };
}

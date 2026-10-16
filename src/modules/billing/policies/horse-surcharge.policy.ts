import { ConflictException } from '@nestjs/common';
import { fieldBadRequest } from '../../../common/utils/field-errors';

/**
 * Kiểm khoảng ngày của phụ phí mới
 *
 * @param startDate Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate Ngày kết thúc (YYYY-MM-DD)
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @throws BadRequestException Nếu ngày bắt đầu trước hôm nay, hoặc ngày kết thúc trước ngày bắt đầu
 */
export function assertSurchargeDates(
  startDate: string,
  endDate: string,
  today: string,
): void {
  if (startDate < today) {
    throw fieldBadRequest('startDate', 'Ngày bắt đầu phải từ hôm nay trở đi');
  }
  if (endDate < startDate) {
    throw fieldBadRequest(
      'endDate',
      'Ngày kết thúc không được trước ngày bắt đầu',
    );
  }
}

/**
 * Kiểm phụ phí kết thúc sớm được: đã bắt đầu và chưa hết
 *
 * @param startDate Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate Ngày kết thúc hiện tại (YYYY-MM-DD)
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @throws ConflictException Nếu phụ phí chưa bắt đầu (xóa thay vì kết thúc) hoặc đã kết thúc từ trước hôm nay
 */
export function assertSurchargeEndable(
  startDate: string,
  endDate: string,
  today: string,
): void {
  if (startDate > today) {
    throw new ConflictException(
      'Phụ phí chưa bắt đầu, hãy xóa thay vì kết thúc',
    );
  }
  if (endDate <= today) {
    throw new ConflictException('Phụ phí đã kết thúc');
  }
}

/**
 * Kiểm phụ phí xóa được: chưa tới ngày bắt đầu
 *
 * @param startDate Ngày bắt đầu (YYYY-MM-DD)
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @throws ConflictException Nếu phụ phí đã bắt đầu tính
 */
export function assertSurchargeDeletable(
  startDate: string,
  today: string,
): void {
  if (startDate <= today) {
    throw new ConflictException(
      'Phụ phí đã bắt đầu tính, chỉ kết thúc sớm được',
    );
  }
}

/**
 * Kiểm phụ phí xác nhận áp dụng được: chưa xác nhận và chưa kết thúc
 *
 * @param appliedAt Lúc đã xác nhận, null nếu chưa
 * @param endDate Ngày kết thúc (YYYY-MM-DD)
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @throws ConflictException Nếu đã xác nhận, hoặc đã kết thúc trước hôm nay
 */
export function assertSurchargeApplicable(
  appliedAt: Date | null,
  endDate: string,
  today: string,
): void {
  if (appliedAt) {
    throw new ConflictException('Phụ phí đã được xác nhận áp dụng');
  }
  if (endDate < today) {
    throw new ConflictException('Phụ phí đã kết thúc');
  }
}

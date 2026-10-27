import { ConflictException } from '@nestjs/common';
import { fieldBadRequest } from '../../../common/utils/field-errors';

/**
 * Chặn đặt mức phí có ngày hiệu lực ở quá khứ
 *
 * @param effectiveFrom Ngày hiệu lực (YYYY-MM-DD)
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @throws BadRequestException Nếu ngày hiệu lực trước hôm nay
 */
export function assertEffectiveFromNotPast(
  effectiveFrom: string,
  today: string,
): void {
  if (effectiveFrom < today) {
    throw fieldBadRequest(
      'effectiveFrom',
      'Ngày hiệu lực phải từ hôm nay trở đi',
    );
  }
}

/**
 * Chặn xóa mức phí đã có hiệu lực
 *
 * @param effectiveFrom Ngày hiệu lực của mức phí (YYYY-MM-DD)
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @throws ConflictException Nếu mức phí đã hiệu lực (ngày hiệu lực từ hôm nay trở về trước)
 */
export function assertDailyFeeDeletable(
  effectiveFrom: string,
  today: string,
): void {
  if (effectiveFrom <= today) {
    throw new ConflictException('Mức phí đã có hiệu lực, không xóa được');
  }
}

/**
 * Chặn sửa mức phí đã bị mức mới hơn thay thế
 *
 * - Mức chưa hiệu lực (ngày hiệu lực sau hôm nay): sửa được
 * - Mức đang áp dụng (ngày hiệu lực lớn nhất từ hôm nay trở về trước): sửa được
 * - Mức đã hiệu lực nhưng không phải mức đang áp dụng: 409
 *
 * @param effectiveFrom Ngày hiệu lực của mức phí cần sửa (YYYY-MM-DD)
 * @param today Hôm nay theo lịch CLB (YYYY-MM-DD)
 * @param currentEffectiveFrom Ngày hiệu lực của mức đang áp dụng hôm nay (YYYY-MM-DD), null nếu chưa có mức nào
 * @throws ConflictException Nếu mức phí đã được thay bằng mức mới
 */
export function assertDailyFeeEditable(
  effectiveFrom: string,
  today: string,
  currentEffectiveFrom: string | null,
): void {
  if (effectiveFrom > today || effectiveFrom === currentEffectiveFrom) return;
  throw new ConflictException(
    'Mức phí đã được thay bằng mức mới, không sửa được',
  );
}

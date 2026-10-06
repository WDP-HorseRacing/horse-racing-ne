import { ConflictException } from '@nestjs/common';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import type {
  OwnershipPeriod,
  OwnershipTransferInput,
} from '../types/horse.types';
import { isReadOnlyLifecycle } from './horse.policy';

/**
 * Kiểm tra một lần chuyển nhượng nội bộ ngựa sang chủ khác
 *
 * - Kiểm lần lượt: hồ sơ chỉ được xem (409), ngựa chưa có chủ (409), chủ mới trùng chủ hiện tại (400)
 *
 * @param input Vòng đời, chủ hiện tại và chủ mới
 * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất, hoặc ngựa chưa có chủ
 * @throws BadRequestException Nếu chủ mới trùng chủ hiện tại, lỗi gắn ô `newOwnerId`
 */
export function assertOwnershipTransfer(input: OwnershipTransferInput): void {
  if (isReadOnlyLifecycle(input.lifecycleStatus)) {
    throw new ConflictException(
      'Chỉ chuyển chủ được cho ngựa đang ở câu lạc bộ',
    );
  }
  if (input.currentOwnerId === null) {
    throw new ConflictException(
      'Ngựa chưa có chủ sở hữu, dùng Gán chủ thay cho chuyển nhượng',
    );
  }
  if (input.newOwnerId === input.currentOwnerId) {
    throw fieldBadRequest(
      'newOwnerId',
      'Chủ mới trùng với chủ sở hữu hiện tại',
    );
  }
}

/**
 * Tìm giai đoạn sở hữu chứa một thời điểm
 *
 * - Giai đoạn chứa thời điểm `at` khi bắt đầu không sau `at` và chưa kết thúc tại `at` (kết thúc đúng lúc `at` thì thuộc giai đoạn sau)
 *
 * @param periods Các giai đoạn sở hữu của một con ngựa
 * @param at Thời điểm cần tra
 * @returns Giai đoạn chứa thời điểm, null nếu lúc đó ngựa không có chủ
 */
export function ownershipAt(
  periods: OwnershipPeriod[],
  at: Date,
): OwnershipPeriod | null {
  return (
    periods.find(
      (period) =>
        period.startedAt <= at &&
        (period.endedAt === null || at < period.endedAt),
    ) ?? null
  );
}

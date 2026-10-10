import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { SupplyCategory } from '../../supplies/enums/supply-category.enum';
import {
  FEEDING_MEAL_LABELS,
  FeedingMeal,
} from '../constants/feeding-meal.enum';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';

const FEEDABLE_CATEGORIES: readonly SupplyCategory[] = [
  SupplyCategory.FEED,
  SupplyCategory.SUPPLEMENT,
];

/**
 * Bắt buộc gửi đúng một nguồn dòng khẩu phần: nhập tay hoặc sao từ khẩu phần có sẵn
 *
 * @param hasItems Có gửi items
 * @param hasCopySource Có gửi copyFromPlanId
 * @throws BadRequestException Nếu gửi cả hai hoặc không gửi cái nào
 */
export function assertOneRationSource(
  hasItems: boolean,
  hasCopySource: boolean,
): void {
  if (hasItems === hasCopySource) {
    throw new BadRequestException(
      'Gửi đúng một trong hai: các dòng khẩu phần hoặc khẩu phần để sao',
    );
  }
}

/**
 * Chặn một vật tư xuất hiện hai lần trong cùng một bữa
 *
 * @param items Các dòng khẩu phần
 * @throws BadRequestException Nếu một bữa có hai dòng cùng vật tư
 */
export function assertNoDuplicateMealItems(
  items: readonly { meal: FeedingMeal; supplyItemId: string }[],
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.meal}:${item.supplyItemId}`;
    if (seen.has(key)) {
      throw new BadRequestException(
        `Bữa ${FEEDING_MEAL_LABELS[item.meal]} có một vật tư bị nhập hai lần`,
      );
    }
    seen.add(key);
  }
}

/**
 * Bắt buộc vật tư đưa vào khẩu phần là thức ăn hoặc thực phẩm bổ sung
 *
 * @param name Tên vật tư, dùng trong câu báo lỗi
 * @param category Loại vật tư
 * @throws BadRequestException Nếu vật tư không thuộc loại FEED hoặc SUPPLEMENT
 */
export function assertFeedableCategory(
  name: string,
  category: SupplyCategory,
): void {
  if (!FEEDABLE_CATEGORIES.includes(category)) {
    throw new BadRequestException(
      `Vật tư ${name} không phải thức ăn hoặc thực phẩm bổ sung`,
    );
  }
}

/**
 * Bắt buộc khẩu phần còn là bản nháp trước khi sửa, xóa hoặc duyệt
 *
 * @param status Trạng thái hiện tại của khẩu phần
 * @throws ConflictException Nếu khẩu phần không còn DRAFT
 */
export function assertFeedingPlanDraft(status: FeedingPlanStatus): void {
  if (status !== FeedingPlanStatus.DRAFT) {
    throw new ConflictException('Chỉ sửa, xóa hoặc duyệt được khẩu phần nháp');
  }
}

/**
 * Chặn duyệt khẩu phần còn dòng dùng vật tư đã xóa
 *
 * @param deletedNames Tên các vật tư đã xóa trong khẩu phần
 * @throws ConflictException Nếu còn vật tư đã xóa
 */
export function assertNoDeletedSupplies(deletedNames: readonly string[]): void {
  if (deletedNames.length > 0) {
    throw new ConflictException(
      `Vật tư đã ngừng dùng: ${deletedNames.join(', ')}. Sửa khẩu phần trước khi duyệt`,
    );
  }
}

/**
 * Groom chỉ xem được khẩu phần đang áp dụng
 *
 * @param status Trạng thái của khẩu phần
 * @throws ForbiddenException Nếu khẩu phần không ở trạng thái ACTIVE
 */
export function assertGroomSeesActivePlan(status: FeedingPlanStatus): void {
  if (status !== FeedingPlanStatus.ACTIVE) {
    throw new ForbiddenException('Groom chỉ xem được khẩu phần đang áp dụng');
  }
}

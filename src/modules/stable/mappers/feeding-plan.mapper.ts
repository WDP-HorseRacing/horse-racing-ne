import { plainToInstance } from 'class-transformer';
import { FEEDING_MEAL_ORDER } from '../constants/feeding-meal.enum';
import { FeedingPlanResponseDto } from '../dto/feeding-plan.dto';
import type { FeedingPlanEntity } from '../entities/feeding-plan.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển khẩu phần sang response, gom dòng theo bữa đúng thứ tự trong ngày
 *
 * - Bữa không có dòng nào thì không có trong meals
 *
 * @param plan Khẩu phần đã load horse, creator, approver, items.supplyItem (kể cả bản đã xóa)
 * @returns Response của khẩu phần
 */
export function toFeedingPlanResponse(
  plan: FeedingPlanEntity,
): FeedingPlanResponseDto {
  const items = [...plan.items].sort((a, b) => a.position - b.position);
  const meals = FEEDING_MEAL_ORDER.map((meal) => ({
    meal,
    items: items
      .filter((item) => item.meal === meal)
      .map((item) => ({
        supplyItemId: item.supplyItemId,
        name: item.supplyItem.name,
        category: item.supplyItem.category,
        unit: item.supplyItem.unit,
        quantity: item.quantity,
        note: item.note,
      })),
  })).filter((meal) => meal.items.length > 0);
  return plainToInstance(
    FeedingPlanResponseDto,
    { ...plan, horseName: plan.horse.name, meals },
    MAPPER_OPTIONS,
  );
}

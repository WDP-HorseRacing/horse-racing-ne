/**
 * Bữa ăn trong ngày của khẩu phần
 */
export enum FeedingMeal {
  EARLY_MORNING = 'EARLY_MORNING',
  NOON = 'NOON',
  AFTERNOON = 'AFTERNOON',
  EVENING = 'EVENING',
}

/**
 * Thứ tự các bữa trong ngày, dùng để sắp dòng khẩu phần
 */
export const FEEDING_MEAL_ORDER: readonly FeedingMeal[] = [
  FeedingMeal.EARLY_MORNING,
  FeedingMeal.NOON,
  FeedingMeal.AFTERNOON,
  FeedingMeal.EVENING,
];

/**
 * Tên hiển thị của từng bữa, dùng trong câu báo lỗi
 */
export const FEEDING_MEAL_LABELS: Record<FeedingMeal, string> = {
  [FeedingMeal.EARLY_MORNING]: 'Sáng sớm',
  [FeedingMeal.NOON]: 'Trưa',
  [FeedingMeal.AFTERNOON]: 'Chiều',
  [FeedingMeal.EVENING]: 'Tối',
};

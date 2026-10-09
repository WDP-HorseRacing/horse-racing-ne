import { fieldBadRequest } from '../../../common/utils/field-errors';
import { totalPlanWeeks } from './training.policy';

interface PlanPhaseInput {
  weeks: number;
  subjects: ReadonlyArray<{
    subjectId: string;
    weekdays: ReadonlyArray<number>;
  }>;
}

const MAX_PLAN_WEEKS = 104;

const WEEKDAY_NAMES = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ nhật',
];

/**
 * Kiểm các giai đoạn của giáo án hợp lệ
 *
 * - Một môn xuất hiện hai lần trong cùng giai đoạn: 400 ở `phases.{i}.subjects.{j}.subjectId`
 * - Một thứ được chọn cho hơn một môn trong cùng giai đoạn: 400 ở `phases.{i}.subjects.{j}.weekdays`
 * - Kiểm theo thứ tự giai đoạn rồi thứ tự môn; dòng môn đầu tiên vi phạm bị báo
 * - Tổng số tuần các giai đoạn vượt 104: 400 ở `phases`
 *
 * @param phases Các giai đoạn theo thứ tự, mỗi giai đoạn có số tuần và các môn kèm thứ trong tuần
 * @throws BadRequestException Nếu môn bị lặp, thứ bị trùng trong một giai đoạn, hoặc tổng số tuần vượt giới hạn
 */
export function assertPlanPhases(phases: ReadonlyArray<PlanPhaseInput>): void {
  phases.forEach((phase, i) => {
    const subjectIds = new Set<string>();
    const takenDays = new Set<number>();
    phase.subjects.forEach((item, j) => {
      if (subjectIds.has(item.subjectId)) {
        throw fieldBadRequest(
          `phases.${i}.subjects.${j}.subjectId`,
          `Giai đoạn ${i + 1}: môn học bị lặp, gộp thứ vào một dòng`,
        );
      }
      subjectIds.add(item.subjectId);
      const takenDay = item.weekdays.find((day) => takenDays.has(day));
      if (takenDay !== undefined) {
        throw fieldBadRequest(
          `phases.${i}.subjects.${j}.weekdays`,
          `Giai đoạn ${i + 1}: ${WEEKDAY_NAMES[takenDay - 1]} bị chọn cho hơn một môn`,
        );
      }
      item.weekdays.forEach((day) => takenDays.add(day));
    });
  });
  if (totalPlanWeeks(phases) > MAX_PLAN_WEEKS) {
    throw fieldBadRequest(
      'phases',
      `Tổng số tuần của giáo án không quá ${MAX_PLAN_WEEKS}`,
    );
  }
}

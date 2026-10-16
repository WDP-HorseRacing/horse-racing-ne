import { fieldBadRequest } from '../../../common/utils/field-errors';
import { totalPlanWeeks } from './training.policy';

interface PlanPhaseInput {
  weeks: number;
  subjects: ReadonlyArray<{ subjectId: string }>;
}

const MAX_PLAN_WEEKS = 104;

/**
 * Kiểm các giai đoạn của giáo án hợp lệ
 *
 * - Một môn xuất hiện hai lần trong cùng giai đoạn: 400 ở `phases.{i}.subjects.{j}.subjectId`
 * - Kiểm theo thứ tự giai đoạn rồi thứ tự môn; dòng môn đầu tiên vi phạm bị báo
 * - Tổng số tuần các giai đoạn vượt 104: 400 ở `phases`
 *
 * @param phases Các giai đoạn theo thứ tự, mỗi giai đoạn có số tuần và các môn
 * @throws BadRequestException Nếu môn bị lặp trong một giai đoạn, hoặc tổng số tuần vượt giới hạn
 */
export function assertPlanPhases(phases: ReadonlyArray<PlanPhaseInput>): void {
  phases.forEach((phase, i) => {
    const subjectIds = new Set<string>();
    phase.subjects.forEach((item, j) => {
      if (subjectIds.has(item.subjectId)) {
        throw fieldBadRequest(
          `phases.${i}.subjects.${j}.subjectId`,
          `Giai đoạn ${i + 1}: môn học bị lặp`,
        );
      }
      subjectIds.add(item.subjectId);
    });
  });
  if (totalPlanWeeks(phases) > MAX_PLAN_WEEKS) {
    throw fieldBadRequest(
      'phases',
      `Tổng số tuần của giáo án không quá ${MAX_PLAN_WEEKS}`,
    );
  }
}

/**
 * Tính thời lượng tối thiểu của một giai đoạn
 *
 * @param phase Số tuần và các môn kèm số buổi tối thiểu mỗi tuần và thời lượng môn
 * @returns Số phút: số tuần × tổng (số buổi tối thiểu × thời lượng môn)
 */
export function phaseMinMinutes(phase: {
  weeks: number;
  subjects: ReadonlyArray<{
    minSessionsPerWeek: number;
    subject: { durationMinutes: number };
  }>;
}): number {
  return (
    phase.weeks *
    phase.subjects.reduce(
      (sum, item) =>
        sum + item.minSessionsPerWeek * item.subject.durationMinutes,
      0,
    )
  );
}

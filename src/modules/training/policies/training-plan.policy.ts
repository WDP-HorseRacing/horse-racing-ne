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

/**
 * Một tuần trong tiến độ xếp lịch của lớp
 */
export interface ClassWeekProgress {
  week: number;
  phasePosition: number;
  startDate: string;
  endDate: string;
  subjects: Array<{
    subjectId: string;
    minSessions: number;
    scheduledSessions: number;
  }>;
}

/**
 * Tính tiến độ xếp lịch của lớp theo từng tuần: mỗi môn của giai đoạn đã xếp bao nhiêu buổi so với số buổi tối thiểu
 *
 * - Tuần thứ n gồm 7 ngày từ ngày bắt đầu lớp + (n − 1) × 7; giai đoạn sắp theo `position`
 * - Buổi tính vào tuần chứa ngày bắt đầu của buổi (lịch CLB); buổi ngoài các tuần của lớp bị bỏ
 * - Môn trong tuần giữ thứ tự của `subjects` trong giai đoạn
 *
 * @param classStartDate Ngày bắt đầu của lớp dạng YYYY-MM-DD
 * @param phases Các giai đoạn của lớp kèm môn và số buổi tối thiểu mỗi tuần
 * @param sessions Ngày bắt đầu (lịch CLB) và môn của các buổi chưa hủy
 * @returns Các tuần theo thứ tự
 */
export function classWeeklyProgress(
  classStartDate: string,
  phases: ReadonlyArray<{
    position: number;
    weeks: number;
    subjects: ReadonlyArray<{ subjectId: string; minSessionsPerWeek: number }>;
  }>,
  sessions: ReadonlyArray<{ date: string; subjectId: string | null }>,
): ClassWeekProgress[] {
  const start = Date.parse(`${classStartDate}T00:00:00Z`);
  const dayOf = (offset: number) =>
    new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (!session.subjectId) continue;
    const week =
      Math.floor(
        (Date.parse(`${session.date}T00:00:00Z`) - start) / (7 * 86_400_000),
      ) + 1;
    const key = `${week}:${session.subjectId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: ClassWeekProgress[] = [];
  for (const phase of [...phases].sort((a, b) => a.position - b.position)) {
    for (let i = 0; i < phase.weeks; i += 1) {
      const week = result.length + 1;
      result.push({
        week,
        phasePosition: phase.position,
        startDate: dayOf((week - 1) * 7),
        endDate: dayOf(week * 7 - 1),
        subjects: phase.subjects.map((item) => ({
          subjectId: item.subjectId,
          minSessions: item.minSessionsPerWeek,
          scheduledSessions: counts.get(`${week}:${item.subjectId}`) ?? 0,
        })),
      });
    }
  }
  return result;
}

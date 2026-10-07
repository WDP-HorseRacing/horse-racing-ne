import { clubDateTimeToInstant } from '../../../common/utils/club-date';
import type { TrainingSubjectEntity } from '../entities/training-subject.entity';

/**
 * Một buổi tập sinh từ giáo án, chưa lưu.
 */
export interface GeneratedSession {
  week: number;
  subject: TrainingSubjectEntity;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
}

/**
 * Sinh lịch buổi tập của lớp từ giáo án
 *
 * - Tuần thứ n (tính từ ngày bắt đầu, mỗi tuần 7 ngày) học môn đang chiếm tuần n trong giáo án
 * - Trong mỗi tuần, mỗi ngày có thứ nằm trong `weekdays` sinh một buổi lúc `startTime` theo giờ CLB, dài `durationMinutes` phút
 * - Thứ theo ISO: 1 là thứ Hai, 7 là Chủ nhật
 *
 * @param items Các môn của giáo án theo thứ tự, kèm số tuần
 * @param startDate Ngày bắt đầu lớp dạng YYYY-MM-DD
 * @param weekdays Các thứ trong tuần có buổi tập
 * @param startTime Giờ bắt đầu dạng HH:mm theo giờ CLB
 * @param durationMinutes Thời lượng mỗi buổi (phút)
 * @returns Các buổi tập theo thứ tự thời gian
 */
export function buildClassSchedule(
  items: ReadonlyArray<{ subject: TrainingSubjectEntity; weeks: number }>,
  startDate: string,
  weekdays: ReadonlyArray<number>,
  startTime: string,
  durationMinutes: number,
): GeneratedSession[] {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`);
  const sessions: GeneratedSession[] = [];
  let week = 0;
  for (const item of items) {
    for (let i = 0; i < item.weeks; i += 1) {
      week += 1;
      for (let offset = 0; offset < 7; offset += 1) {
        const day = new Date(start);
        day.setUTCDate(start.getUTCDate() + (week - 1) * 7 + offset);
        const isoWeekday = ((day.getUTCDay() + 6) % 7) + 1;
        if (!weekdays.includes(isoWeekday)) continue;
        const scheduledStartAt = clubDateTimeToInstant(
          day.toISOString().slice(0, 10),
          startTime,
        );
        sessions.push({
          week,
          subject: item.subject,
          scheduledStartAt,
          scheduledEndAt: new Date(
            scheduledStartAt.getTime() + durationMinutes * 60_000,
          ),
        });
      }
    }
  }
  return sessions;
}

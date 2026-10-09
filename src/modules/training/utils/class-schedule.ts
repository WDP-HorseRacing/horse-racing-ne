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
 * Sinh lịch buổi tập của lớp từ các giai đoạn của giáo án
 *
 * - Tuần thứ n (tính từ ngày bắt đầu, mỗi tuần 7 ngày) thuộc giai đoạn đang chiếm tuần n trong giáo án
 * - Mỗi ngày sinh một buổi của môn có `weekdays` chứa thứ của ngày đó trong giai đoạn, lúc `startTime` theo giờ CLB, dài `durationMinutes` phút
 * - Ngày không thuộc môn nào của giai đoạn: không có buổi
 * - Thứ theo ISO: 1 là thứ Hai, 7 là Chủ nhật
 *
 * @param phases Các giai đoạn của giáo án theo thứ tự, mỗi giai đoạn có số tuần và các môn kèm thứ trong tuần
 * @param startDate Ngày bắt đầu lớp dạng YYYY-MM-DD
 * @param startTime Giờ bắt đầu dạng HH:mm theo giờ CLB
 * @param durationMinutes Thời lượng mỗi buổi (phút)
 * @returns Các buổi tập theo thứ tự thời gian
 */
export function buildClassSchedule(
  phases: ReadonlyArray<{
    weeks: number;
    subjects: ReadonlyArray<{
      subject: TrainingSubjectEntity;
      weekdays: ReadonlyArray<number>;
    }>;
  }>,
  startDate: string,
  startTime: string,
  durationMinutes: number,
): GeneratedSession[] {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`);
  const sessions: GeneratedSession[] = [];
  let week = 0;
  for (const phase of phases) {
    for (let i = 0; i < phase.weeks; i += 1) {
      week += 1;
      for (let offset = 0; offset < 7; offset += 1) {
        const day = new Date(start);
        day.setUTCDate(start.getUTCDate() + (week - 1) * 7 + offset);
        const isoWeekday = ((day.getUTCDay() + 6) % 7) + 1;
        const item = phase.subjects.find((subject) =>
          subject.weekdays.includes(isoWeekday),
        );
        if (!item) continue;
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

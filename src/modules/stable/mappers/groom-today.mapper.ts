import { plainToInstance } from 'class-transformer';
import type { CareScheduleEntity } from '../../medical/entities/care-schedule.entity';
import type { SessionParticipantEntity } from '../../training/entities/session-participant.entity';
import type { DailyChecklistResponseDto } from '../dto/daily-checklist.dto';
import type { FeedingPlanResponseDto } from '../dto/feeding-plan.dto';
import { GroomTodayResponseDto } from '../dto/groom-today.dto';
import type { HorseEntity } from '../../horses/entities/horse.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Dữ liệu hôm nay của một con ngựa, đã gom sẵn
 */
export interface GroomTodayHorseSource {
  horse: HorseEntity;
  stallCode: string | null;
  checklist: DailyChecklistResponseDto | null;
  feedingPlan: FeedingPlanResponseDto | null;
  runs: SessionParticipantEntity[];
  schedules: CareScheduleEntity[];
}

/**
 * Chuyển dữ liệu hôm nay của Groom sang response
 *
 * - Lịch chăm sóc đến hạn trước đầu ngày được đánh dấu overdue
 *
 * @param date Hôm nay theo lịch CLB, YYYY-MM-DD
 * @param dayStart Đầu ngày theo giờ CLB
 * @param horses Dữ liệu từng ngựa; mỗi lượt tập đã load session
 * @returns Response màn Hôm nay
 */
export function toGroomTodayResponse(
  date: string,
  dayStart: Date,
  horses: readonly GroomTodayHorseSource[],
): GroomTodayResponseDto {
  return plainToInstance(
    GroomTodayResponseDto,
    {
      date,
      horses: horses.map((source) => ({
        horseId: source.horse.id,
        horseName: source.horse.name,
        barnName: source.horse.barn?.name ?? null,
        stallCode: source.stallCode,
        checklist: source.checklist,
        feedingPlan: source.feedingPlan,
        trainingRuns: source.runs.map((run) => ({
          participantId: run.id,
          sessionId: run.sessionId,
          sessionName: run.session.name,
          scheduledStartAt: run.session.scheduledStartAt,
          scheduledEndAt: run.session.scheduledEndAt,
          status: run.status,
        })),
        careSchedules: source.schedules.map((schedule) => ({
          id: schedule.id,
          type: schedule.type,
          dueAt: schedule.dueAt,
          overdue: schedule.dueAt < dayStart,
          notes: schedule.notes,
        })),
      })),
    },
    MAPPER_OPTIONS,
  );
}

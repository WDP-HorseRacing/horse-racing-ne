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
}

/**
 * Chuyển dữ liệu hôm nay của Groom sang response
 *
 * @param date Hôm nay theo lịch CLB, YYYY-MM-DD
 * @param horses Dữ liệu từng ngựa; mỗi lượt tập đã load session
 * @param assistedRuns Lượt Groom được giao dắt ở ngựa Groom không phụ trách, đã load session và horse
 * @param vetAppointments Lịch hẹn bác sĩ hôm nay ở ngựa Groom phụ trách, đã load horse
 * @returns Response màn Hôm nay
 */
export function toGroomTodayResponse(
  date: string,
  horses: readonly GroomTodayHorseSource[],
  assistedRuns: readonly SessionParticipantEntity[],
  vetAppointments: readonly CareScheduleEntity[],
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
        trainingRuns: source.runs.map(toRun),
      })),
      assistedRuns: assistedRuns.map((run) => ({
        ...toRun(run),
        horseId: run.horseId,
        horseName: run.horse.name,
      })),
      horseVetAppointments: vetAppointments.map((appointment) => ({
        id: appointment.id,
        horseId: appointment.horseId,
        horseName: appointment.horse.name,
        type: appointment.type,
        scheduledAt: appointment.dueAt,
      })),
    },
    MAPPER_OPTIONS,
  );
}

/**
 * Chuyển một lượt tập Groom được giao dắt sang dữ liệu response
 *
 * @param run Lượt tập đã load session
 * @returns Dữ liệu lượt tập kèm giờ, địa điểm, mặt sân của buổi
 */
function toRun(run: SessionParticipantEntity) {
  return {
    participantId: run.id,
    sessionId: run.sessionId,
    sessionName: run.session.name,
    scheduledStartAt: run.session.scheduledStartAt,
    scheduledEndAt: run.session.scheduledEndAt,
    location: run.session.location,
    surface: run.session.surface,
    status: run.status,
    stoppedReason: run.stoppedReason,
  };
}

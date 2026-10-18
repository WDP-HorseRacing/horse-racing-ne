import type { SessionParticipantEntity } from '../entities/session-participant.entity';
import type { GroomRun } from '../types/training-session.types';

/**
 * Chuyển lượt tập đã load session và horse sang dữ liệu xét trùng giờ của Groom
 *
 * @param participant Lượt tập đã load session và horse
 * @returns Lượt tập kèm giờ, trạng thái buổi, tên buổi và tên ngựa
 */
export function toGroomRun(participant: SessionParticipantEntity): GroomRun {
  return {
    sessionId: participant.sessionId,
    status: participant.status,
    sessionStatus: participant.session.status,
    sessionName: participant.session.name,
    horseName: participant.horse.name,
    scheduledStartAt: participant.session.scheduledStartAt,
    scheduledEndAt: participant.session.scheduledEndAt,
  };
}

import { EntityManager, In } from 'typeorm';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import {
  HORSE_SCHEDULE_SESSION_STATUSES,
  OPEN_GROOM_RUN_STATUSES,
} from '../policies/training.policy';

/**
 * Đếm số lượt tập chưa diễn ra mà một người đang được giao dắt
 *
 * - Lượt tính vào: lượt còn mở (PLANNED, PRESENT, READY, ONGOING) thuộc buổi Đã lên lịch hoặc Đang diễn ra
 * - Tính cả lượt dắt hộ ngựa mà người này không phụ trách
 *
 * @param manager EntityManager của transaction đang chạy
 * @param groomId UUID người được giao dắt
 * @returns Promise trả về số lượt tập chưa diễn ra
 */
export function countPendingGroomRuns(
  manager: EntityManager,
  groomId: string,
): Promise<number> {
  return manager.getRepository(SessionParticipantEntity).count({
    where: {
      assignedGroomId: groomId,
      status: In([...OPEN_GROOM_RUN_STATUSES]),
      session: { status: In([...HORSE_SCHEDULE_SESSION_STATUSES]) },
    },
  });
}

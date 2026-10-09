import { plainToInstance } from 'class-transformer';
import {
  SessionParticipantListItemDto,
  SessionParticipantResponseDto,
} from '../dto/session-participant.dto';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import type { ParticipantListDisplay } from '../types/training-session.types';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toSessionParticipantResponse(
  row: SessionParticipantEntity,
): SessionParticipantResponseDto {
  return plainToInstance(SessionParticipantResponseDto, row, MAPPER_OPTIONS);
}

/**
 * Chuyển lượt tham gia sang dòng của danh sách lượt tập, kèm cờ ngựa đang bị khóa huấn luyện, tên và ảnh ngựa, tên Groom
 *
 * @param row Lượt tham gia
 * @param lockedHorseIds Các ngựa đang có lệnh khóa huấn luyện hiệu lực
 * @param display Tên ngựa, link ảnh đã ký và tên Groom được giao
 * @returns Dòng danh sách lượt tập
 */
export function toSessionParticipantListItem(
  row: SessionParticipantEntity,
  lockedHorseIds: Set<string>,
  display: ParticipantListDisplay,
): SessionParticipantListItemDto {
  return plainToInstance(
    SessionParticipantListItemDto,
    {
      ...row,
      trainingLocked: lockedHorseIds.has(row.horseId),
      ...display,
    },
    MAPPER_OPTIONS,
  );
}

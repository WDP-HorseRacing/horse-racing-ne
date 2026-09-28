import { plainToInstance } from 'class-transformer';
import { SessionParticipantResponseDto } from '../dto/session-participant.dto';
import { SessionParticipantEntity } from '../entities/session-participant.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toSessionParticipantResponse(
  row: SessionParticipantEntity,
): SessionParticipantResponseDto {
  return plainToInstance(SessionParticipantResponseDto, row, MAPPER_OPTIONS);
}

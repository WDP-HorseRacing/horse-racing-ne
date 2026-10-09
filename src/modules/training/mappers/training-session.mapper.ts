import { plainToInstance } from 'class-transformer';
import {
  PublishedSessionResponseDto,
  TrainingSessionResponseDto,
} from '../dto/training-session.dto';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import type { SkippedHorse } from '../types/training-session.types';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTrainingSessionResponse(
  row: TrainingSessionEntity,
): TrainingSessionResponseDto {
  return plainToInstance(TrainingSessionResponseDto, row, MAPPER_OPTIONS);
}

/**
 * Chuyển buổi vừa publish sang response, kèm các ngựa bị bỏ qua vì trùng giờ
 *
 * @param row Buổi tập vừa publish
 * @param skippedHorses Các ngựa không được tạo lượt ở buổi này
 * @returns Response của buổi vừa publish
 */
export function toPublishedSessionResponse(
  row: TrainingSessionEntity,
  skippedHorses: SkippedHorse[],
): PublishedSessionResponseDto {
  return plainToInstance(
    PublishedSessionResponseDto,
    { ...row, skippedHorses },
    MAPPER_OPTIONS,
  );
}

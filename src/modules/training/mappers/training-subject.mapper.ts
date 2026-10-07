import { plainToInstance } from 'class-transformer';
import { TrainingSubjectResponseDto } from '../dto/training-subject.dto';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển môn học sang response DTO
 *
 * @param row Môn học đã lưu
 * @returns Môn học để trả ra API
 */
export function toTrainingSubjectResponse(
  row: TrainingSubjectEntity,
): TrainingSubjectResponseDto {
  return plainToInstance(TrainingSubjectResponseDto, row, MAPPER_OPTIONS);
}

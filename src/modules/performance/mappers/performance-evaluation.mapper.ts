import { plainToInstance } from 'class-transformer';
import { PerformanceEvaluationResponseDto } from '../dto/performance-evaluation.dto';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';

export function toPerformanceEvaluationResponse(
  row: PerformanceEvaluationEntity,
): PerformanceEvaluationResponseDto {
  return plainToInstance(PerformanceEvaluationResponseDto, row, {
    excludeExtraneousValues: true,
  });
}

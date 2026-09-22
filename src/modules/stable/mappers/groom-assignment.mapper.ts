import { plainToInstance } from 'class-transformer';
import { GroomAssignmentResponseDto } from '../dto/groom-assignment.dto';
import type { GroomAssignmentEntity } from '../entities/groom-assignment.entity';

/**
 * Map a groom assignment to its response, including the groom summary when loaded
 * @param entity The groom assignment entity
 * @returns The groom assignment response
 */
export function toGroomAssignmentResponse(
  entity: GroomAssignmentEntity,
): GroomAssignmentResponseDto {
  return plainToInstance(GroomAssignmentResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}

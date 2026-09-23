import { plainToInstance } from 'class-transformer';
import {
  GroomAssignmentResponseDto,
  GroomWorkloadResponseDto,
} from '../dto/groom-assignment.dto';
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

/**
 * Ánh xạ một dòng thống kê khối lượng công việc của groom sang response.
 *
 * @param row Dòng thống kê gồm groomId, fullName, activeHorseCount
 * @returns GroomWorkloadResponseDto
 */
export function toGroomWorkloadResponse(row: {
  groomId: string;
  fullName: string;
  activeHorseCount: number;
}): GroomWorkloadResponseDto {
  return plainToInstance(GroomWorkloadResponseDto, row, {
    excludeExtraneousValues: true,
  });
}

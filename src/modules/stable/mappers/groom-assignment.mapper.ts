import { plainToInstance } from 'class-transformer';
import {
  GroomAssignmentResponseDto,
  GroomWorkloadResponseDto,
} from '../dto/groom-assignment.dto';
import type { GroomAssignmentEntity } from '../entities/groom-assignment.entity';

/**
 * Ánh xạ phân công groom sang response, kèm thông tin tóm tắt của groom nếu quan hệ đã được nạp
 *
 * @param entity Phân công groom cần chuyển đổi
 * @returns GroomAssignmentResponseDto
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

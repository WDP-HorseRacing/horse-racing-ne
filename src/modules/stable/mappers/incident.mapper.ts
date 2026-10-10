import { plainToInstance } from 'class-transformer';
import type { MedicalExamRequestEntity } from '../../medical/entities/medical-exam-request.entity';
import { IncidentResponseDto } from '../dto/incident.dto';
import type { IncidentEntity } from '../entities/incident.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển sự cố sang response, kèm link ảnh và yêu cầu khám gắn với nó
 *
 * @param incident Sự cố đã load horse, reporter, resolver (kể cả bản đã xóa)
 * @param photoUrl Link xem ảnh có hạn, null nếu không có ảnh
 * @param examRequest Yêu cầu khám của sự cố, null nếu không có
 * @returns Response của sự cố
 */
export function toIncidentResponse(
  incident: IncidentEntity,
  photoUrl: string | null,
  examRequest: MedicalExamRequestEntity | null,
): IncidentResponseDto {
  return plainToInstance(
    IncidentResponseDto,
    {
      ...incident,
      horseName: incident.horse.name,
      photoUrl,
      resolver: incident.resolvedBy ? incident.resolver : null,
      examRequest,
    },
    MAPPER_OPTIONS,
  );
}

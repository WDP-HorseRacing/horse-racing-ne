import { VisitEditHealthOutcome } from '../constants/medical-visit.enum';
import {
  EditMedicalRecordResponseDto,
  MedicalRecordResponseDto,
} from '../dto/medical-record.response.dto';
import type { LaterHealthChange } from '../types/medical-visit.types';

/**
 * Gắn kết quả xử lý trạng thái sức khỏe vào response của buổi khám vừa sửa
 *
 * @param record Response của buổi khám sau khi sửa
 * @param healthOutcome Cách trạng thái sức khỏe của ngựa được xử lý
 * @param laterChange Lần đổi sức khỏe mới nhất sau buổi khám, null nếu không có
 * @returns EditMedicalRecordResponseDto - laterHealthChange chỉ có giá trị khi healthOutcome là KEPT_LATER_CHANGE
 */
export function toEditMedicalRecordResponse(
  record: MedicalRecordResponseDto,
  healthOutcome: VisitEditHealthOutcome,
  laterChange: LaterHealthChange | null,
): EditMedicalRecordResponseDto {
  return {
    ...record,
    healthOutcome,
    laterHealthChange:
      healthOutcome === VisitEditHealthOutcome.KEPT_LATER_CHANGE && laterChange
        ? {
            changedAt: laterChange.changedAt,
            changedBy: laterChange.changedBy,
            to: laterChange.to,
          }
        : null,
  };
}

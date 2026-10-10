import { ConflictException } from '@nestjs/common';
import { ExamRequestStatus } from '../../medical/constants/exam-request.enum';
import { IncidentStatus } from '../constants/incident-status.enum';

/**
 * Bắt buộc sự cố còn mở
 *
 * @param status Trạng thái sự cố
 * @throws ConflictException Nếu sự cố đã đóng
 */
export function assertIncidentOpen(status: IncidentStatus): void {
  if (status !== IncidentStatus.OPEN) {
    throw new ConflictException('Sự cố đã đóng');
  }
}

/**
 * Chặn chuyển bác sĩ lần hai cho cùng một sự cố
 *
 * @param hasExamRequest Sự cố đã có yêu cầu khám
 * @throws ConflictException Nếu sự cố đã có yêu cầu khám
 */
export function assertIncidentNotReferred(hasExamRequest: boolean): void {
  if (hasExamRequest) {
    throw new ConflictException('Sự cố đã được chuyển bác sĩ');
  }
}

/**
 * Chặn đóng sự cố khi yêu cầu khám gắn với nó còn chờ bác sĩ
 *
 * @param examStatus Trạng thái yêu cầu khám của sự cố, null nếu không có
 * @throws ConflictException Nếu yêu cầu khám còn PENDING
 */
export function assertIncidentResolvable(
  examStatus: ExamRequestStatus | null,
): void {
  if (examStatus === ExamRequestStatus.PENDING) {
    throw new ConflictException(
      'Bác sĩ chưa xử lý yêu cầu khám của sự cố, chưa đóng được',
    );
  }
}

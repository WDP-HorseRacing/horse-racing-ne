import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, In } from 'typeorm';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import type { ExamRequestHandledEvent } from '../types/medical-events.types';

/**
 * Các câu ghi dùng chung lên bảng medical_exam_requests, luôn chạy trong transaction đang mở
 */
@Injectable()
export class ExamRequestWritesService {
  /**
   * Đánh dấu các yêu cầu khám đã được khám trong một buổi khám
   *
   * @param manager EntityManager của transaction đang chạy
   * @param requestIds UUID các yêu cầu khám
   * @param handledBy UUID người khám
   * @param medicalRecordId UUID buổi khám
   * @returns Promise hoàn tất khi đã ghi
   */
  async markExamined(
    manager: EntityManager,
    requestIds: string[],
    handledBy: string,
    medicalRecordId: string,
  ): Promise<void> {
    await manager.update(
      MedicalExamRequestEntity,
      { id: In(requestIds) },
      {
        status: ExamRequestStatus.EXAMINED,
        handledBy,
        handledAt: new Date(),
        medicalRecordId,
      },
    );
  }

  /**
   * Bác mọi yêu cầu khám còn chờ của con ngựa khi hồ sơ ngựa chuyển sang chỉ được xem (chuyển nhượng hoặc đã mất)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param handledAt Thời điểm bác
   * @param dismissReason Lý do bác ghi vào yêu cầu
   * @returns Promise trả về số yêu cầu đã bác
   */
  async dismissPendingBeforeReadOnly(
    manager: EntityManager,
    horseId: string,
    handledAt: Date,
    dismissReason: string,
  ): Promise<number> {
    const result = await manager.getRepository(MedicalExamRequestEntity).update(
      { horseId, status: ExamRequestStatus.PENDING },
      {
        status: ExamRequestStatus.DISMISSED,
        dismissReason,
        handledBy: null,
        handledAt,
      },
    );
    return result.affected ?? 0;
  }
}

/**
 * Dựng payload báo người gửi yêu cầu khám rằng bác sĩ đã khám hoặc bỏ qua
 *
 * - Yêu cầu không có người gửi (hệ thống tự sinh) hoặc người gửi chính là người xử lý: không báo
 *
 * @param request Yêu cầu khám trước khi đổi trạng thái
 * @param outcome Trạng thái mới: đã khám hoặc bỏ qua
 * @param handledBy UUID người xử lý
 * @param dismissReason Lý do bỏ qua, null khi đã khám
 * @returns Payload của MEDICAL_EXAM_REQUEST_HANDLED_EVENT, hoặc null nếu không cần báo
 */
export function examRequestHandledEvent(
  request: Pick<
    MedicalExamRequestEntity,
    'id' | 'horseId' | 'requestedBy' | 'description'
  >,
  outcome: ExamRequestHandledEvent['outcome'],
  handledBy: string,
  dismissReason: string | null,
): ExamRequestHandledEvent | null {
  if (!request.requestedBy || request.requestedBy === handledBy) return null;
  return {
    eventId: randomUUID(),
    horseId: request.horseId,
    requestId: request.id,
    requestedBy: request.requestedBy,
    outcome,
    description: request.description,
    dismissReason,
  };
}

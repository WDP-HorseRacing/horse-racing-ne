import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';

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

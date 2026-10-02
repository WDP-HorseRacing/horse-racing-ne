import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { TRANSFER_CANCEL_REASON } from '../constants/medical.constants';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';

/**
 * Các câu ghi lên bảng medical_exam_requests mà nhiều feature y tế cùng dùng, luôn chạy trong transaction của nơi gọi
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
   * Bác mọi yêu cầu khám còn chờ của con ngựa khi chuyển nhượng
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param handledAt Thời điểm bác
   * @returns Promise trả về số yêu cầu đã bác
   */
  async dismissPendingForTransfer(
    manager: EntityManager,
    horseId: string,
    handledAt: Date,
  ): Promise<number> {
    const result = await manager.getRepository(MedicalExamRequestEntity).update(
      { horseId, status: ExamRequestStatus.PENDING },
      {
        status: ExamRequestStatus.DISMISSED,
        dismissReason: TRANSFER_CANCEL_REASON,
        handledBy: null,
        handledAt,
      },
    );
    return result.affected ?? 0;
  }
}

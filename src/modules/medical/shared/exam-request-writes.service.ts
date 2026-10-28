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
   * @returns Promise trả về thời điểm xử lý đã ghi
   */
  async markExamined(
    manager: EntityManager,
    requestIds: string[],
    handledBy: string,
    medicalRecordId: string,
  ): Promise<Date> {
    const handledAt = new Date();
    await manager.update(
      MedicalExamRequestEntity,
      { id: In(requestIds) },
      {
        status: ExamRequestStatus.EXAMINED,
        handledBy,
        handledAt,
        medicalRecordId,
      },
    );
    return handledAt;
  }

  /**
   * Trả các yêu cầu khám mà một buổi khám đã đánh dấu EXAMINED về lại hàng đợi khi buổi khám bị hủy hoặc bỏ gắn yêu cầu
   *
   * - Khóa các yêu cầu EXAMINED gắn với buổi khám (chỉ các id truyền vào nếu có), xử lý theo thứ tự tạo
   * - Yêu cầu về PENDING, bỏ gắn buổi khám, xóa người xử lý, thời điểm xử lý và lý do bỏ qua
   * - Yêu cầu tự sinh từ cảnh báo chỉ số mà ngựa đã có yêu cầu PENDING cùng loại cảnh báo: chuyển DISMISSED với lý do truyền vào, bỏ gắn buổi khám
   *
   * @param manager EntityManager của transaction đang chạy
   * @param medicalRecordId UUID buổi khám
   * @param handledBy UUID bác sĩ hủy hoặc sửa buổi khám
   * @param duplicateReason Lý do bỏ qua yêu cầu trùng cảnh báo đang chờ
   * @param requestIds UUID các yêu cầu cần trả; bỏ trống là mọi yêu cầu của buổi khám
   * @returns Promise trả về các yêu cầu đã về hàng đợi và các yêu cầu đã bỏ qua, mỗi phần tử là bản trước khi đổi
   */
  async reopenExamined(
    manager: EntityManager,
    medicalRecordId: string,
    handledBy: string,
    duplicateReason: string,
    requestIds?: string[],
  ): Promise<{
    reopened: MedicalExamRequestEntity[];
    dismissed: MedicalExamRequestEntity[];
  }> {
    const linked = await manager.find(MedicalExamRequestEntity, {
      where: {
        medicalRecordId,
        status: ExamRequestStatus.EXAMINED,
        ...(requestIds ? { id: In(requestIds) } : {}),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
      lock: { mode: 'for_no_key_update' },
    });
    const reopened: MedicalExamRequestEntity[] = [];
    const dismissed: MedicalExamRequestEntity[] = [];
    for (const request of linked) {
      const duplicate =
        request.alertType !== null &&
        (await manager.exists(MedicalExamRequestEntity, {
          where: {
            horseId: request.horseId,
            alertType: request.alertType,
            status: ExamRequestStatus.PENDING,
          },
        }));
      await manager.update(
        MedicalExamRequestEntity,
        { id: request.id },
        duplicate
          ? {
              status: ExamRequestStatus.DISMISSED,
              dismissReason: duplicateReason,
              handledBy,
              handledAt: new Date(),
              medicalRecordId: null,
            }
          : {
              status: ExamRequestStatus.PENDING,
              dismissReason: null,
              handledBy: null,
              handledAt: null,
              medicalRecordId: null,
            },
      );
      (duplicate ? dismissed : reopened).push(request);
    }
    return { reopened, dismissed };
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
 * Dựng payload event bác sĩ đã khám hoặc bỏ qua một yêu cầu khám
 *
 * @param request Yêu cầu khám trước khi đổi trạng thái
 * @param outcome Trạng thái mới: đã khám hoặc bỏ qua
 * @param handledBy UUID người xử lý
 * @param handledAt Thời điểm xử lý đã ghi vào yêu cầu
 * @param dismissReason Lý do bỏ qua, null khi đã khám
 * @returns Payload của MEDICAL_EXAM_REQUEST_HANDLED_EVENT
 */
export function examRequestHandledEvent(
  request: Pick<
    MedicalExamRequestEntity,
    'id' | 'horseId' | 'requestedBy' | 'incidentId' | 'description'
  >,
  outcome: ExamRequestHandledEvent['outcome'],
  handledBy: string,
  handledAt: Date,
  dismissReason: string | null,
): ExamRequestHandledEvent {
  return {
    eventId: randomUUID(),
    horseId: request.horseId,
    requestId: request.id,
    requestedBy: request.requestedBy,
    incidentId: request.incidentId,
    outcome,
    description: request.description,
    dismissReason,
    handledBy,
    handledAt: handledAt.toISOString(),
  };
}

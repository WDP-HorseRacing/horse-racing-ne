import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import {
  OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
  TRANSFER_CANCEL_REASON,
} from '../constants/medical.constants';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalSharedRepository } from './medical-shared.repository';

/**
 * Số việc y tế còn treo đã được hệ thống tự đóng khi ngựa chuyển nhượng.
 */
export interface MedicalTransferSettlement {
  examRequestsDismissed: number;
  careSchedulesCancelled: number;
}

@Injectable()
export class MedicalLifecycleService {
  constructor(
    private readonly shared: MedicalSharedRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lý do chặn chuyển nhượng về mặt y tế, dùng cho bảng xem trước đổi vòng đời (F1.8 mục 5)
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns A promise resolving to câu lý do nếu ngựa còn bệnh án đang mở, null nếu chuyển nhượng được
   */
  async transferBlockReason(
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string | null> {
    const openCase = await this.shared.findOpenCase(horseId, manager);
    return openCase ? OPEN_CASE_BLOCKS_TRANSFER_MESSAGE : null;
  }

  /**
   * Đếm việc y tế sẽ bị hệ thống tự đóng nếu chuyển nhượng, dùng cho bảng xem trước đổi vòng đời (F1.8 mục 5)
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns A promise resolving to số yêu cầu khám đang chờ và số lịch chưa làm
   */
  async transferImpact(
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ examRequestsToDismiss: number; careSchedulesToCancel: number }> {
    const [examRequestsToDismiss, careSchedulesToCancel] = await Promise.all([
      manager.count(MedicalExamRequestEntity, {
        where: { horseId, status: ExamRequestStatus.PENDING },
      }),
      manager.count(CareScheduleEntity, {
        where: { horseId, status: CareScheduleStatus.SCHEDULED },
      }),
    ]);
    return { examRequestsToDismiss, careSchedulesToCancel };
  }

  /**
   * Chốt phần y tế khi chuyển nhượng ngựa, chạy trong transaction của F1.8 (Flow 3 mục III.8)
   *
   * - Chặn 409 nếu ngựa còn bệnh án đang mở
   * - Yêu cầu khám đang chờ chuyển DISMISSED với lý do "Do chuyển nhượng", người xử lý để null vì hệ thống làm
   * - Lịch hẹn khám định kỳ và lịch chăm sóc chưa làm chuyển CANCELLED với cùng lý do
   * - Không tự mở transaction, không publish event; nơi gọi đã khóa row ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns A promise resolving to số yêu cầu khám bị bỏ qua và số lịch bị hủy
   * @throws ConflictException Nếu ngựa còn bệnh án đang mở
   */
  async settleForTransfer(
    manager: EntityManager,
    horseId: string,
  ): Promise<MedicalTransferSettlement> {
    const blockReason = await this.transferBlockReason(horseId, manager);
    if (blockReason) throw new ConflictException(blockReason);

    const now = new Date();
    const requests = await manager
      .getRepository(MedicalExamRequestEntity)
      .update(
        { horseId, status: ExamRequestStatus.PENDING },
        {
          status: ExamRequestStatus.DISMISSED,
          dismissReason: TRANSFER_CANCEL_REASON,
          handledBy: null,
          handledAt: now,
        },
      );
    const schedules = await manager.getRepository(CareScheduleEntity).update(
      {
        horseId,
        status: CareScheduleStatus.SCHEDULED,
      },
      {
        status: CareScheduleStatus.CANCELLED,
        cancelReason: TRANSFER_CANCEL_REASON,
      },
    );
    return {
      examRequestsDismissed: requests.affected ?? 0,
      careSchedulesCancelled: schedules.affected ?? 0,
    };
  }
}

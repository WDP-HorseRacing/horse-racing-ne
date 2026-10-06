import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import type { ReadOnlyLifecycleStatus } from '../../horses/types/horse.types';
import {
  READ_ONLY_CANCEL_REASONS,
  OPEN_CASE_BLOCKS_READ_ONLY_MESSAGES,
} from '../constants/medical.constants';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { CareScheduleWritesService } from './care-schedule-writes.service';
import { ExamRequestWritesService } from './exam-request-writes.service';
import { MedicalAccessService } from './medical-access.service';

/**
 * Số việc y tế còn treo đã được hệ thống tự đóng khi hồ sơ ngựa chuyển sang chỉ được xem.
 */
export interface MedicalReadOnlySettlement {
  examRequestsDismissed: number;
  careSchedulesCancelled: number;
}

@Injectable()
export class MedicalLifecycleService {
  constructor(
    private readonly access: MedicalAccessService,
    private readonly requestWrites: ExamRequestWritesService,
    private readonly scheduleWrites: CareScheduleWritesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lý do chặn chuyển hồ sơ ngựa sang chỉ được xem (chuyển nhượng hoặc ghi nhận đã mất) về mặt y tế
   *
   * @param horseId UUID của ngựa
   * @param to Trạng thái chỉ được xem muốn chuyển sang (TRANSFERRED hoặc DECEASED)
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns Promise trả về câu lý do theo trạng thái đích nếu ngựa còn bệnh án đang mở, null nếu không bị chặn
   */
  async readOnlyBlockReason(
    horseId: string,
    to: ReadOnlyLifecycleStatus,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string | null> {
    const openCase = await this.access.findOpenCase(horseId, manager);
    return openCase ? OPEN_CASE_BLOCKS_READ_ONLY_MESSAGES[to] : null;
  }

  /**
   * Đếm việc y tế sẽ bị hệ thống tự đóng nếu hồ sơ ngựa chuyển sang chỉ được xem
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns Promise trả về số yêu cầu khám đang chờ và số lịch chưa làm
   */
  async readOnlyImpact(
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
   * Chốt phần y tế trước khi hồ sơ ngựa chuyển sang chỉ được xem (chuyển nhượng hoặc ghi nhận đã mất), chạy trong transaction đang mở
   *
   * - Chặn 409 nếu ngựa còn bệnh án đang mở, câu chặn theo trạng thái đích
   * - Yêu cầu khám đang chờ chuyển DISMISSED với lý do "Do chuyển nhượng" hoặc "Do ngựa mất", người xử lý để null
   * - Lịch hẹn khám định kỳ và lịch chăm sóc chưa làm chuyển CANCELLED với cùng lý do
   * - Không tự mở transaction, không publish event, không khóa row ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param to Trạng thái chỉ được xem muốn chuyển sang (TRANSFERRED hoặc DECEASED)
   * @returns Promise trả về số yêu cầu khám bị bỏ qua và số lịch bị hủy
   * @throws ConflictException Nếu ngựa còn bệnh án đang mở
   */
  async settleBeforeReadOnly(
    manager: EntityManager,
    horseId: string,
    to: ReadOnlyLifecycleStatus,
  ): Promise<MedicalReadOnlySettlement> {
    // Xem có bị chặn gì không. Nếu chặn thì lấy reason (bệnh án còn mở)
    const blockReason = await this.readOnlyBlockReason(horseId, to, manager);
    if (blockReason) throw new ConflictException(blockReason);
    // Trả về số lượng các yêu cầu khám bị bác bỏ (PENDING → DISMISSED)
    const examRequestsDismissed =
      await this.requestWrites.dismissPendingBeforeReadOnly(
        manager,
        horseId,
        new Date(),
        READ_ONLY_CANCEL_REASONS[to],
      );
    // Trả về số lượng các lịch chăm sóc bị hủy (SCHEDULED → CANCELLED)
    const careSchedulesCancelled =
      await this.scheduleWrites.cancelOpenSchedulesBeforeReadOnly(
        manager,
        horseId,
        READ_ONLY_CANCEL_REASONS[to],
      );
    return { examRequestsDismissed, careSchedulesCancelled };
  }
}

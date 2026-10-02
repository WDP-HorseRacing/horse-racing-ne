import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import { TRANSFER_CANCEL_REASON } from '../constants/medical.constants';
import { CareScheduleEntity } from '../entities/care-schedule.entity';

/**
 * Các câu ghi lên bảng care_schedules mà nhiều feature y tế cùng dùng, luôn chạy trong transaction của nơi gọi
 */
@Injectable()
export class CareScheduleWritesService {
  /**
   * Hoàn tất ngày hẹn khám định kỳ đang Đã lên lịch của con ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param completedBy UUID người khám
   * @returns Promise trả về số ngày hẹn đã hoàn tất
   */
  async completeRoutineCheckup(
    manager: EntityManager,
    horseId: string,
    completedBy: string,
  ): Promise<number> {
    const result = await manager.update(
      CareScheduleEntity,
      {
        horseId,
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.SCHEDULED,
      },
      {
        status: CareScheduleStatus.COMPLETED,
        completedAt: new Date(),
        completedBy,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Hủy mọi lịch chăm sóc còn Đã lên lịch của con ngựa khi chuyển nhượng
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise trả về số lịch đã hủy
   */
  async cancelOpenSchedulesForTransfer(
    manager: EntityManager,
    horseId: string,
  ): Promise<number> {
    const result = await manager.getRepository(CareScheduleEntity).update(
      {
        horseId,
        status: CareScheduleStatus.SCHEDULED,
      },
      {
        status: CareScheduleStatus.CANCELLED,
        cancelReason: TRANSFER_CANCEL_REASON,
      },
    );
    return result.affected ?? 0;
  }
}

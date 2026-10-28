import { Injectable } from '@nestjs/common';
import { EntityManager, In, LessThanOrEqual, MoreThan } from 'typeorm';
import {
  DailyChecklistStatus,
  OPEN_CHECKLIST_STATUSES,
} from '../constants/daily-checklist-status.enum';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { FeedingPlanEntity } from '../entities/feeding-plan.entity';
import { HorseCareTaskEntity } from '../entities/horse-care-task.entity';

/**
 * Số dữ liệu chăm sóc chuồng đã được hệ thống chốt khi hồ sơ ngựa chuyển sang chỉ được xem
 */
export interface StableReadOnlySettlement {
  feedingPlansArchived: number;
  draftFeedingPlansDeleted: number;
  careTasksEnded: number;
  careTasksDeleted: number;
  checklistCancelled: boolean;
}

/**
 * Số dữ liệu chăm sóc chuồng sẽ bị chốt nếu hồ sơ ngựa chuyển sang chỉ được xem
 */
export interface StableReadOnlyImpact {
  feedingPlansToArchive: number;
  draftFeedingPlansToDelete: number;
  careTasksToEnd: number;
  careTasksToDelete: number;
  checklistToCancel: boolean;
}

/**
 * Chốt dữ liệu chăm sóc chuồng (khẩu phần, việc riêng, checklist hôm nay) cho module khác khi ngựa chuyển nhượng hoặc ghi nhận đã mất
 */
@Injectable()
export class StableLifecycleService {
  /**
   * Đếm dữ liệu chăm sóc chuồng sẽ bị chốt nếu hồ sơ ngựa chuyển sang chỉ được xem. Không ghi gì.
   *
   * @param manager EntityManager dùng để query
   * @param horseId UUID của ngựa
   * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
   * @returns Promise trả về số khẩu phần ACTIVE, số bản nháp, số việc riêng đang chạy qua hôm nay, số việc riêng chưa bắt đầu và checklist hôm nay còn mở hay không
   */
  async readOnlyImpact(
    manager: EntityManager,
    horseId: string,
    today: string,
  ): Promise<StableReadOnlyImpact> {
    const [
      feedingPlansToArchive,
      draftFeedingPlansToDelete,
      careTasksToEnd,
      careTasksToDelete,
      openChecklists,
    ] = await Promise.all([
      manager.countBy(FeedingPlanEntity, {
        horseId,
        status: FeedingPlanStatus.ACTIVE,
      }),
      manager.countBy(FeedingPlanEntity, {
        horseId,
        status: FeedingPlanStatus.DRAFT,
      }),
      manager.countBy(HorseCareTaskEntity, runningTaskWhere(horseId, today)),
      manager.countBy(HorseCareTaskEntity, futureTaskWhere(horseId, today)),
      manager.countBy(DailyChecklistEntity, openChecklistWhere(horseId, today)),
    ]);
    return {
      feedingPlansToArchive,
      draftFeedingPlansToDelete,
      careTasksToEnd,
      careTasksToDelete,
      checklistToCancel: openChecklists > 0,
    };
  }

  /**
   * Chốt dữ liệu chăm sóc chuồng trước khi hồ sơ ngựa chuyển sang chỉ được xem, chạy trong transaction đang mở
   *
   * - Khẩu phần ACTIVE chuyển ARCHIVED, ghi thời điểm hết hiệu lực; bản nháp bị xóa cùng các dòng; bản ARCHIVED giữ nguyên
   * - Việc riêng (gắn thêm và miễn) đã bắt đầu và còn chạy sau hôm nay kết thúc ở hôm nay; việc riêng chưa bắt đầu bị xóa; việc kết thúc từ hôm nay trở về trước giữ nguyên
   * - Checklist hôm nay còn PENDING hoặc IN_PROGRESS chuyển CANCELLED, việc đã tick giữ nguyên
   * - Không tự mở transaction, không publish event, không khóa row ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
   * @returns Promise trả về số khẩu phần lưu trữ, số bản nháp xóa, số việc riêng kết thúc, số việc riêng xóa và checklist hôm nay có bị hủy không
   */
  async settleBeforeReadOnly(
    manager: EntityManager,
    horseId: string,
    today: string,
  ): Promise<StableReadOnlySettlement> {
    const archived = await manager.update(
      FeedingPlanEntity,
      { horseId, status: FeedingPlanStatus.ACTIVE },
      { status: FeedingPlanStatus.ARCHIVED, archivedAt: new Date() },
    );
    const drafts = await manager.delete(FeedingPlanEntity, {
      horseId,
      status: FeedingPlanStatus.DRAFT,
    });
    const ended = await manager.update(
      HorseCareTaskEntity,
      runningTaskWhere(horseId, today),
      { toDate: today },
    );
    const deleted = await manager.delete(
      HorseCareTaskEntity,
      futureTaskWhere(horseId, today),
    );
    const cancelled = await manager.update(
      DailyChecklistEntity,
      openChecklistWhere(horseId, today),
      { status: DailyChecklistStatus.CANCELLED },
    );
    return {
      feedingPlansArchived: archived.affected ?? 0,
      draftFeedingPlansDeleted: drafts.affected ?? 0,
      careTasksEnded: ended.affected ?? 0,
      careTasksDeleted: deleted.affected ?? 0,
      checklistCancelled: (cancelled.affected ?? 0) > 0,
    };
  }
}

/**
 * Điều kiện việc riêng đã bắt đầu và còn chạy sau hôm nay
 *
 * @param horseId UUID của ngựa
 * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
 * @returns Điều kiện where của TypeORM
 */
function runningTaskWhere(horseId: string, today: string) {
  return {
    horseId,
    fromDate: LessThanOrEqual(today),
    toDate: MoreThan(today),
  };
}

/**
 * Điều kiện việc riêng chưa tới ngày bắt đầu
 *
 * @param horseId UUID của ngựa
 * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
 * @returns Điều kiện where của TypeORM
 */
function futureTaskWhere(horseId: string, today: string) {
  return { horseId, fromDate: MoreThan(today) };
}

/**
 * Điều kiện checklist hôm nay của ngựa còn PENDING hoặc IN_PROGRESS
 *
 * @param horseId UUID của ngựa
 * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
 * @returns Điều kiện where của TypeORM
 */
function openChecklistWhere(horseId: string, today: string) {
  return {
    horseId,
    checklistDate: today,
    status: In([...OPEN_CHECKLIST_STATUSES]),
  };
}

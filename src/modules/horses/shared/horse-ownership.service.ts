import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { toClubDate } from '../../../common/utils/club-date';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';

/**
 * Một lần đổi chủ sở hữu của ngựa
 */
export interface OwnerChange {
  horseId: string;
  ownerId: string | null;
  at: Date;
  effectiveDate?: string;
  reason?: string | null;
  recordedBy: string | null;
}

@Injectable()
export class HorseOwnershipService {
  /**
   * Ghi lại một lần đổi chủ sở hữu của ngựa vào lịch sử, chạy trong transaction đang mở
   *
   * - Đóng giai đoạn đang mở (nếu có) tại thời điểm `at`
   * - Có chủ mới: mở giai đoạn mới bắt đầu tại `at`; ngày hiệu lực mặc định là ngày của `at` theo lịch câu lạc bộ
   * - Không tự cập nhật horses.owner_id, nơi gọi tự cập nhật trong cùng transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param change Ngựa, chủ mới (null nếu bỏ trống chủ), thời điểm ghi nhận, ngày hiệu lực, lý do và người ghi nhận
   * @returns Promise hoàn tất khi đã ghi lịch sử
   */
  async recordOwnerChange(
    manager: EntityManager,
    change: OwnerChange,
  ): Promise<void> {
    const ownerships = manager.getRepository(HorseOwnershipEntity);
    await ownerships.update(
      { horseId: change.horseId, endedAt: IsNull() },
      { endedAt: change.at },
    );
    if (change.ownerId === null) return;
    await ownerships.insert({
      horseId: change.horseId,
      ownerId: change.ownerId,
      effectiveDate: change.effectiveDate ?? toClubDate(change.at),
      startedAt: change.at,
      reason: change.reason ?? null,
      recordedBy: change.recordedBy,
    });
  }

  /**
   * Lấy ngày hiệu lực của giai đoạn sở hữu đang mở
   *
   * @param manager EntityManager dùng để query
   * @param horseId UUID của ngựa
   * @returns Promise trả về ngày hiệu lực (YYYY-MM-DD), null nếu ngựa chưa có chủ
   */
  async currentOwnerSince(
    manager: EntityManager,
    horseId: string,
  ): Promise<string | null> {
    const current = await manager.findOne(HorseOwnershipEntity, {
      where: { horseId, endedAt: IsNull() },
      select: { id: true, effectiveDate: true },
    });
    return current?.effectiveDate ?? null;
  }
}

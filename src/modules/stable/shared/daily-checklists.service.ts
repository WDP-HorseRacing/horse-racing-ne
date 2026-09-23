import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager, In, IsNull, MoreThanOrEqual } from 'typeorm';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';

/**
 * Các thao tác trên checklist hằng ngày mà feature khác trong module stable được gọi (vd groom-assignments khi đổi groom). Đặt ở shared để feature không import feature anh em (guide mục 2).
 *
 * - Chạy trên manager nơi gọi truyền vào, để đi chung transaction và lock
 */
@Injectable()
export class DailyChecklistsService {
  /**
   * Chuyển checklist chưa hoàn thành từ một ngày trở đi của groom cũ sang groom mới
   *
   * - Chỉ chuyển checklist của đúng con ngựa, của groom cũ, chưa hoàn thành và có ngày từ fromDate trở đi
   * - Checklist đã hoàn thành hoặc của ngày trước fromDate giữ nguyên tên người đã làm
   * - Lock các checklist sẽ chuyển (pessimistic_write) trước khi kiểm trùng ngày
   * - Groom mới đã có checklist cùng ngày cho ngựa này thì báo lỗi, không gộp và không bỏ qua
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param fromGroomId UUID của groom cũ
   * @param toGroomId UUID của groom mới
   * @param fromDate Ngày bắt đầu chuyển, dạng YYYY-MM-DD (thường là hôm nay theo giờ câu lạc bộ)
   * @returns A promise resolving to UUID các checklist đã chuyển
   * @throws ConflictException Nếu groom mới đã có checklist trùng ngày cho ngựa này
   */
  async moveOpenChecklistsToGroom(
    manager: EntityManager,
    horseId: string,
    fromGroomId: string,
    toGroomId: string,
    fromDate: string,
  ): Promise<string[]> {
    const openChecklists = await manager.find(DailyChecklistEntity, {
      where: {
        horseId,
        groomId: fromGroomId,
        completedAt: IsNull(),
        checklistDate: MoreThanOrEqual(fromDate),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (openChecklists.length === 0) return [];

    const clashes = await manager.find(DailyChecklistEntity, {
      where: {
        horseId,
        groomId: toGroomId,
        checklistDate: In(openChecklists.map((c) => c.checklistDate)),
      },
      order: { checklistDate: 'ASC' },
    });
    if (clashes.length > 0) {
      const clashDates = clashes.map((c) => c.checklistDate).join(', ');
      throw new ConflictException(
        `Groom mới đã có checklist của ngựa này vào ngày ${clashDates}, không chuyển được checklist chưa hoàn thành của groom cũ`,
      );
    }

    const ids = openChecklists.map((c) => c.id);
    await manager.update(
      DailyChecklistEntity,
      { id: In(ids) },
      { groomId: toGroomId },
    );
    return ids;
  }
}

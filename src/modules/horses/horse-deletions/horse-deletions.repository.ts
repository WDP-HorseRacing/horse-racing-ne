import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HORSE_BUSINESS_TABLES } from '../constants/horse.constants';

@Injectable()
export class HorseDeletionsRepository {
  /**
   * Liệt kê các loại dữ liệu nghiệp vụ ngựa đã phát sinh, để chặn xóa hồ sơ và báo cho Club Manager biết đang vướng gì (F1.8, E1)
   *
   * - Tính cả dòng đã đóng, đã hủy hoặc đã xóa mềm, vì đều là lịch sử
   * - Danh sách bảng và nhãn lấy từ HORSE_BUSINESS_TABLES; chỉ đọc bảng của module khác
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager của transaction đang chạy
   * @returns A promise resolving to nhãn các loại dữ liệu đang có, rỗng nếu chưa phát sinh gì
   */
  async businessDataLabels(
    horseId: string,
    manager: EntityManager,
  ): Promise<string[]> {
    const tables = Object.keys(HORSE_BUSINESS_TABLES);
    const checks = tables
      .map(
        (table) =>
          `EXISTS (SELECT 1 FROM ${table} WHERE horse_id = $1) AS "${table}"`,
      )
      .join(', ');
    const rows: Array<Record<string, boolean>> = await manager.query(
      `SELECT ${checks}`,
      [horseId],
    );
    return tables
      .filter((table) => rows[0]?.[table] === true)
      .map((table) => HORSE_BUSINESS_TABLES[table]);
  }

  /**
   * Lấy tên khu theo id, kể cả khu đã xóa mềm, để hiện ở bảng xem trước khôi phục hồ sơ
   *
   * @param barnId UUID của khu
   * @param manager EntityManager dùng để query
   * @returns A promise resolving to tên khu, hoặc null nếu không có khu đó
   */
  async barnName(
    barnId: string,
    manager: EntityManager,
  ): Promise<string | null> {
    const rows: Array<{ name: string }> = await manager.query(
      'SELECT name FROM barns WHERE id = $1',
      [barnId],
    );
    return rows[0]?.name ?? null;
  }
}

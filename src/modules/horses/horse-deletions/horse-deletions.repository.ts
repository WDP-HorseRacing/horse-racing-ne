import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HORSE_BUSINESS_TABLES } from '../constants/horse.constants';

@Injectable()
export class HorseDeletionsRepository {
  /**
   * Liệt kê các loại dữ liệu nghiệp vụ ngựa đã phát sinh
   *
   * - Tính cả dòng đã đóng, đã hủy hoặc đã xóa mềm
   * - Danh sách bảng và nhãn lấy từ HORSE_BUSINESS_TABLES; chỉ đọc bảng của module khác
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise trả về nhãn các loại dữ liệu đang có, rỗng nếu chưa phát sinh gì
   */
  async businessDataLabels(
    manager: EntityManager,
    horseId: string,
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
   * Lấy tên khu theo id, kể cả khu đã xóa mềm
   *
   * @param manager EntityManager dùng để query
   * @param barnId UUID của khu
   * @returns Promise trả về tên khu, hoặc null nếu không có khu đó
   */
  async barnName(
    manager: EntityManager,
    barnId: string,
  ): Promise<string | null> {
    const rows: Array<{ name: string }> = await manager.query(
      'SELECT name FROM barns WHERE id = $1',
      [barnId],
    );
    return rows[0]?.name ?? null;
  }
}

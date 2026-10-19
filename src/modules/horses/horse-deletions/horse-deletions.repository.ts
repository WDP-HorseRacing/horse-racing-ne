import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HORSE_BUSINESS_TABLES } from '../constants/horse.constants';
import type { RebilledCharges } from '../types/horse.types';

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
   * Tính phí báo cáo sẽ tính lại cho những ngày hồ sơ ngựa bị xóa nếu khôi phục
   *
   * - Xét từng ngày từ from tới to, tính cả hai đầu
   * - Phí ngày: ngày nào có mức phí thì lấy mức có ngày hiệu lực gần nhất không sau ngày đó; ngày chưa có mức phí thì không tính
   * - Phụ phí: cộng phí ngày của mọi khoản phụ phí của ngựa có khoảng ngày chứa ngày đó
   * - Chỉ đọc bảng của module billing
   *
   * @param manager EntityManager dùng để đọc
   * @param horseId UUID của ngựa
   * @param from Ngày xóa hồ sơ theo lịch CLB (YYYY-MM-DD)
   * @param to Hôm nay theo lịch CLB (YYYY-MM-DD)
   * @returns Promise trả về số ngày tính phí, tổng phí ngày và tổng phụ phí
   */
  async rebilledCharges(
    manager: EntityManager,
    horseId: string,
    from: string,
    to: string,
  ): Promise<RebilledCharges> {
    const rows: Array<{
      billedDays: number;
      dailyFee: string;
      surcharge: string;
    }> = await manager.query(
      `SELECT COUNT(fee.daily_fee)::int AS "billedDays",
              COALESCE(SUM(fee.daily_fee), 0)::text AS "dailyFee",
              COALESCE(SUM(extra.amount), 0)::text AS "surcharge"
         FROM generate_series(0, $3::date - $2::date) i
         CROSS JOIN LATERAL (SELECT $2::date + i AS day) days
         LEFT JOIN LATERAL (
           SELECT f.daily_fee FROM daily_fees f
            WHERE f.effective_from <= days.day
            ORDER BY f.effective_from DESC
            LIMIT 1
         ) fee ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(s.daily_amount) AS amount FROM horse_surcharges s
            WHERE s.horse_id = $1
              AND days.day BETWEEN s.start_date AND s.end_date
         ) extra ON TRUE`,
      [horseId, from, to],
    );
    return {
      billedDays: rows[0].billedDays,
      dailyFee: Number(rows[0].dailyFee),
      surcharge: Number(rows[0].surcharge),
    };
  }
}

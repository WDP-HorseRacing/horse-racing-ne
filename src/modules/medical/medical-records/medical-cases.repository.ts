import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants';

/**
 * Một dòng báo cáo chi phí, đọc thô từ DB (tổng chi phí dạng chuỗi).
 */
export interface MedicalCostReportRow {
  horseId: string;
  horseName: string;
  visitCount: number;
  totalCost: string;
}

@Injectable()
export class MedicalCasesRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tổng chi phí các buổi khám chưa hủy theo từng con ngựa, lọc theo khoảng ngày khám
   *
   * - Ngày khám tính theo lịch câu lạc bộ, lấy cả hai đầu khoảng
   * - Gồm buổi khám trong và ngoài bệnh án
   * - Lọc khu theo khu của ngựa lúc khám (r.barn_id), không theo khu hiện tại; tính cả hồ sơ đã xóa
   * - Lọc chủ theo giai đoạn sở hữu: buổi khám thuộc chủ đang sở hữu ngựa lúc khám (started_at <= exam_date < ended_at)
   *
   * @param filter Khoảng ngày (YYYY-MM-DD), khu lúc khám và chủ ngựa (tùy chọn)
   * @returns Promise trả về mỗi con ngựa một dòng, chi phí cao nhất lên trên
   */
  costByHorse(filter: {
    from: string;
    to: string;
    barnId?: string;
    ownerId?: string;
  }): Promise<MedicalCostReportRow[]> {
    const params: unknown[] = [CLUB_TIME_ZONE, filter.from, filter.to];
    const conditions: string[] = [];
    if (filter.barnId) {
      params.push(filter.barnId);
      conditions.push(`AND r.barn_id = $${params.length}`);
    }
    if (filter.ownerId) {
      params.push(filter.ownerId);
      conditions.push(
        `AND EXISTS (SELECT 1 FROM horse_ownerships o
                      WHERE o.horse_id = r.horse_id
                        AND o.owner_id = $${params.length}
                        AND o.started_at <= r.exam_date
                        AND (o.ended_at IS NULL OR r.exam_date < o.ended_at))`,
      );
    }
    return this.dataSource.query(
      `SELECT h.id AS "horseId",
              h.name AS "horseName",
              COUNT(r.id)::int AS "visitCount",
              SUM(r.cost)::text AS "totalCost"
         FROM medical_records r
         JOIN horses h ON h.id = r.horse_id
        WHERE r.voided_at IS NULL
          AND (r.exam_date AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date
          ${conditions.join(' ')}
        GROUP BY h.id, h.name
        ORDER BY SUM(r.cost) DESC, h.name`,
      params,
    );
  }
}

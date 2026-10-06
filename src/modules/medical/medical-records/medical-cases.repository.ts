import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants';
import { MedicalCaseStatus } from '../constants/medical-case.enum';

/**
 * Một dòng báo cáo chi phí, đọc thô từ DB (tổng chi phí dạng chuỗi).
 */
export interface MedicalCostReportRow {
  horseId: string;
  horseName: string;
  caseCount: number;
  totalCost: string;
}

@Injectable()
export class MedicalCasesRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tổng chi phí các bệnh án đã đóng theo từng con ngựa, lọc theo khoảng ngày đóng
   *
   * - Ngày đóng tính theo lịch câu lạc bộ, lấy cả hai đầu khoảng
   * - Lọc khu và chủ theo hồ sơ ngựa hiện tại; tính cả hồ sơ đã xóa
   *
   * @param filter Khoảng ngày (YYYY-MM-DD), khu và chủ ngựa (tùy chọn)
   * @returns Promise trả về mỗi con ngựa một dòng, chi phí cao nhất lên trên
   */
  costByHorse(filter: {
    from: string;
    to: string;
    barnId?: string;
    ownerId?: string;
  }): Promise<MedicalCostReportRow[]> {
    const params: unknown[] = [
      MedicalCaseStatus.CLOSED,
      CLUB_TIME_ZONE,
      filter.from,
      filter.to,
    ];
    const conditions: string[] = [];
    if (filter.barnId) {
      params.push(filter.barnId);
      conditions.push(`AND h.barn_id = $${params.length}`);
    }
    if (filter.ownerId) {
      params.push(filter.ownerId);
      conditions.push(`AND h.owner_id = $${params.length}`);
    }
    return this.dataSource.query(
      `SELECT h.id AS "horseId",
              h.name AS "horseName",
              COUNT(c.id)::int AS "caseCount",
              SUM(c.total_cost)::text AS "totalCost"
         FROM medical_cases c
         JOIN horses h ON h.id = c.horse_id
        WHERE c.status = $1
          AND (c.closed_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
          ${conditions.join(' ')}
        GROUP BY h.id, h.name
        ORDER BY SUM(c.total_cost) DESC, h.name`,
      params,
    );
  }
}

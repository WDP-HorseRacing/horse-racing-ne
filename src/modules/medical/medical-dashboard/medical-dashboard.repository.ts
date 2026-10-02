import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import type { DashboardOpenCaseDto } from '../dto';

@Injectable()
export class MedicalDashboardRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Bệnh án đang mở của các con ngựa, kèm buổi khám gần nhất chưa hủy và ngày hẹn tái khám của buổi đó
   *
   * @param horseIds Các con ngựa đang hiển thị trên bảng điều khiển
   * @returns Promise trả về bệnh án đang mở, ngày hẹn tái khám gần nhất lên trên
   */
  openCases(horseIds: string[]): Promise<DashboardOpenCaseDto[]> {
    if (horseIds.length === 0) return Promise.resolve([]);
    return this.dataSource.query(
      `SELECT c.id AS "caseId",
              c.horse_id AS "horseId",
              h.name AS "horseName",
              c.initial_diagnosis AS "initialDiagnosis",
              c.opened_at AS "openedAt",
              last.exam_date AS "lastVisitAt",
              last.next_visit_at AS "nextVisitAt"
         FROM medical_cases c
         JOIN horses h ON h.id = c.horse_id
         LEFT JOIN LATERAL (
              SELECT r.exam_date, r.next_visit_at
                FROM medical_records r
               WHERE r.case_id = c.id AND r.voided_at IS NULL
               ORDER BY r.exam_date DESC
               LIMIT 1
         ) last ON true
        WHERE c.status = $1
          AND c.horse_id = ANY($2::uuid[])
        ORDER BY last.next_visit_at ASC NULLS LAST, c.opened_at ASC`,
      [MedicalCaseStatus.OPEN, horseIds],
    );
  }
}

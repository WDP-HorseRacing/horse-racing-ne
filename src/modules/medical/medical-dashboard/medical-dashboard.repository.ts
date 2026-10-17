import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import type { DashboardOpenCaseDto, DashboardPrescriptionDto } from '../dto';

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

  /**
   * Đơn thuốc đang hiệu lực hôm nay của các con ngựa
   *
   * - Đã tới ngày bắt đầu và chưa qua ngày kết thúc (ngày kết thúc tính cả hôm đó)
   * - Không có ngày kết thúc: chỉ lấy đơn thuộc bệnh án đang mở; buổi khám ngoài bệnh án không lấy
   * - Bỏ đơn của buổi khám đã hủy
   *
   * @param horseIds Các con ngựa đang hiển thị trên bảng điều khiển
   * @param today Hôm nay theo lịch câu lạc bộ dạng YYYY-MM-DD
   * @returns Promise trả về đơn thuốc, theo tên ngựa rồi tên thuốc
   */
  todayPrescriptions(
    horseIds: string[],
    today: string,
  ): Promise<DashboardPrescriptionDto[]> {
    if (horseIds.length === 0) return Promise.resolve([]);
    return this.dataSource.query(
      `SELECT p.id AS "prescriptionId",
              r.horse_id AS "horseId",
              h.name AS "horseName",
              p.medicine,
              p.dosage,
              p.frequency,
              p.start_date::text AS "startDate",
              p.end_date::text AS "endDate",
              r.id AS "medicalRecordId",
              r.case_id AS "caseId"
         FROM prescriptions p
         JOIN medical_records r ON r.id = p.medical_record_id
         JOIN horses h ON h.id = r.horse_id
         LEFT JOIN medical_cases c ON c.id = r.case_id
        WHERE r.horse_id = ANY($1::uuid[])
          AND r.voided_at IS NULL
          AND p.start_date <= $2::date
          AND (p.end_date >= $2::date
               OR (p.end_date IS NULL AND c.status = $3))
        ORDER BY h.name, p.medicine, p.id`,
      [horseIds, today, MedicalCaseStatus.OPEN],
    );
  }
}

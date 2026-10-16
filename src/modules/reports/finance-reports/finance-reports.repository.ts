import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { MedicalCaseStatus } from '../../medical/constants/medical-case.enum';
import { SupplyStockMovementType } from '../../supplies/enums/supply-stock-movement-type.enum';
import type {
  DailyFeeRow,
  MedicalChargeRow,
  ReportPeriod,
  SupplyValueRow,
  SurchargeRow,
} from '../types/report.types';

const ON_SITE_STATUSES = [
  HorseLifecycleStatus.ACTIVE,
  HorseLifecycleStatus.RETIRED,
];

/**
 * Truy vấn tổng hợp cho báo cáo tài chính CLB và chi phí chủ ngựa
 */
@Injectable()
export class FinanceReportsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tính phí ngày theo từng chủ và từng con ngựa có ít nhất một ngày còn ở CLB trong kỳ
   *
   * - Mỗi ngày (lịch CLB) từ ngày đầu kỳ tới ngày cuối kỳ, không quá ngày của asOf, xét trạng thái ngay trước lúc hết ngày; ngày của asOf xét ngay trước asOf
   * - Ngày được tính cho người đang là chủ lúc hết ngày, nên ngày chuyển chủ tính cho chủ mới
   * - Bỏ hồ sơ ngựa đang bị xóa
   * - Chỉ tính ngày ngựa còn ở CLB (đang hoạt động hoặc đã giải nghệ) lúc hết ngày; trạng thái lấy từ nhật ký thao tác, chưa có dòng nhật ký nào thì lấy trạng thái hiện tại của ngựa
   * - Mỗi ngày lấy mức phí có ngày hiệu lực gần nhất không sau ngày đó; ngày chưa có mức phí nào thì không tính phí nhưng ngựa vẫn có dòng
   *
   * @param period Khoảng ngày của báo cáo
   * @param asOf Thời điểm hiện tại
   * @param ownerId Chỉ tính cho một chủ; bỏ trống là mọi chủ
   * @returns Promise trả về tên, số ngày tính phí và tổng phí theo chủ và ngựa
   */
  dailyFees(
    period: ReportPeriod,
    asOf: Date,
    ownerId?: string,
  ): Promise<DailyFeeRow[]> {
    const params: unknown[] = [
      period.from,
      period.to,
      asOf,
      CLUB_TIME_ZONE,
      AuditEntityType.HORSE,
      ON_SITE_STATUSES,
    ];
    if (ownerId) params.push(ownerId);
    return this.dataSource.query(
      `WITH days AS (
         SELECT d::date AS day,
                LEAST(((d::date + 1)::timestamp AT TIME ZONE $4), $3::timestamptz) AS at
           FROM generate_series($1::date, LEAST($2::date, ($3::timestamptz AT TIME ZONE $4)::date), interval '1 day') d
       )
       SELECT o.owner_id AS "ownerId",
              u.full_name AS "ownerName",
              o.horse_id AS "horseId",
              h.name AS "horseName",
              COUNT(fee.daily_fee)::int AS "billedDays",
              COALESCE(SUM(fee.daily_fee), 0)::text AS "dailyFee"
         FROM days
         JOIN horse_ownerships o
           ON o.started_at < days.at
          AND (o.ended_at IS NULL OR o.ended_at >= days.at)
         JOIN horses h ON h.id = o.horse_id AND h.deleted_at IS NULL
         JOIN users u ON u.id = o.owner_id
         LEFT JOIN LATERAL (
           SELECT f.daily_fee FROM daily_fees f
            WHERE f.effective_from <= days.day
            ORDER BY f.effective_from DESC
            LIMIT 1
         ) fee ON TRUE
        WHERE COALESCE(
                (SELECT a.after_data->>'lifecycleStatus' FROM audit_logs a
                  WHERE a.entity_type = $5
                    AND a.entity_id = o.horse_id
                    AND a.after_data ? 'lifecycleStatus'
                    AND a.created_at < days.at
                  ORDER BY a.created_at DESC
                  LIMIT 1),
                h.lifecycle_status
              ) = ANY($6::text[])
          ${ownerId ? 'AND o.owner_id = $7' : ''}
        GROUP BY 1, 2, 3, 4`,
      params,
    );
  }

  /**
   * Tính phụ phí chăm sóc riêng theo từng chủ và con ngựa trong kỳ
   *
   * - Mỗi ngày (lịch CLB) của kỳ, không quá ngày của asOf, nằm trong khoảng ngày của một khoản phụ phí thì cộng phí ngày của khoản đó
   * - Ngày được tính cho người đang là chủ lúc hết ngày, chỉ khi ngựa còn ở CLB lúc hết ngày; cùng cách xét như dailyFees
   * - Bỏ hồ sơ ngựa đang bị xóa; ngựa không có phụ phí trong kỳ thì không có dòng
   *
   * @param period Khoảng ngày của báo cáo
   * @param asOf Thời điểm hiện tại
   * @param ownerId Chỉ tính cho một chủ; bỏ trống là mọi chủ
   * @returns Promise trả về tên và tổng phụ phí theo chủ và ngựa
   */
  surcharges(
    period: ReportPeriod,
    asOf: Date,
    ownerId?: string,
  ): Promise<SurchargeRow[]> {
    const params: unknown[] = [
      period.from,
      period.to,
      asOf,
      CLUB_TIME_ZONE,
      AuditEntityType.HORSE,
      ON_SITE_STATUSES,
    ];
    if (ownerId) params.push(ownerId);
    return this.dataSource.query(
      `WITH days AS (
         SELECT d::date AS day,
                LEAST(((d::date + 1)::timestamp AT TIME ZONE $4), $3::timestamptz) AS at
           FROM generate_series($1::date, LEAST($2::date, ($3::timestamptz AT TIME ZONE $4)::date), interval '1 day') d
       )
       SELECT o.owner_id AS "ownerId",
              u.full_name AS "ownerName",
              o.horse_id AS "horseId",
              h.name AS "horseName",
              SUM(s.daily_amount)::text AS "surcharge"
         FROM days
         JOIN horse_surcharges s
           ON days.day BETWEEN s.start_date AND s.end_date
         JOIN horse_ownerships o
           ON o.horse_id = s.horse_id
          AND o.started_at < days.at
          AND (o.ended_at IS NULL OR o.ended_at >= days.at)
         JOIN horses h ON h.id = o.horse_id AND h.deleted_at IS NULL
         JOIN users u ON u.id = o.owner_id
        WHERE COALESCE(
                (SELECT a.after_data->>'lifecycleStatus' FROM audit_logs a
                  WHERE a.entity_type = $5
                    AND a.entity_id = o.horse_id
                    AND a.after_data ? 'lifecycleStatus'
                    AND a.created_at < days.at
                  ORDER BY a.created_at DESC
                  LIMIT 1),
                h.lifecycle_status
              ) = ANY($6::text[])
          ${ownerId ? 'AND o.owner_id = $7' : ''}
        GROUP BY 1, 2, 3, 4`,
      params,
    );
  }

  /**
   * Tính chi phí các bệnh án đóng trong kỳ theo chủ và con ngựa
   *
   * - Chi phí thuộc người đang là chủ lúc bệnh án đóng; lúc đó ngựa không có chủ thì ownerId là null
   *
   * @param period Khoảng ngày của báo cáo
   * @param ownerId Chỉ tính cho một chủ; bỏ trống là mọi bệnh án
   * @returns Promise trả về tên, số bệnh án và tổng chi phí theo chủ và ngựa
   */
  medicalCharges(
    period: ReportPeriod,
    ownerId?: string,
  ): Promise<MedicalChargeRow[]> {
    const params: unknown[] = [
      period.start,
      period.end,
      MedicalCaseStatus.CLOSED,
    ];
    if (ownerId) params.push(ownerId);
    return this.dataSource.query(
      `SELECT o.owner_id AS "ownerId",
              u.full_name AS "ownerName",
              c.horse_id AS "horseId",
              h.name AS "horseName",
              COUNT(*)::int AS "caseCount",
              COALESCE(SUM(c.total_cost), 0)::text AS "medicalCost"
         FROM medical_cases c
         LEFT JOIN horse_ownerships o
           ON o.horse_id = c.horse_id
          AND o.started_at <= c.closed_at
          AND (o.ended_at IS NULL OR c.closed_at < o.ended_at)
         LEFT JOIN users u ON u.id = o.owner_id
         JOIN horses h ON h.id = c.horse_id
        WHERE c.status = $3
          AND c.closed_at >= $1
          AND c.closed_at < $2
          ${ownerId ? 'AND o.owner_id = $4' : ''}
        GROUP BY 1, 2, 3, 4`,
      params,
    );
  }

  /**
   * Tính giá trị vật tư nhập vào và đã dùng trong kỳ theo đơn giá của lô
   *
   * - Nhập vào: các dòng sổ nhập hàng (không gồm tồn ban đầu); đã dùng: các dòng sổ xuất dùng
   * - Giá trị mỗi dòng sổ là số lượng × đơn giá lô, làm tròn tới đồng rồi mới cộng
   *
   * @param period Khoảng ngày của báo cáo
   * @returns Promise trả về tổng giá trị nhập vào và đã dùng
   */
  async supplyValues(period: ReportPeriod): Promise<SupplyValueRow> {
    const [row] = await this.dataSource.query<SupplyValueRow[]>(
      `SELECT COALESCE(SUM(ROUND(m.delta * l.unit_price)) FILTER (WHERE m.type = $3), 0)::text AS purchased,
              COALESCE(SUM(ROUND(-m.delta * l.unit_price)) FILTER (WHERE m.type = $4), 0)::text AS used
         FROM supply_stock_movements m
         JOIN supply_lots l ON l.id = m.lot_id
        WHERE m.created_at >= $1
          AND m.created_at < $2`,
      [
        period.start,
        period.end,
        SupplyStockMovementType.RESTOCK,
        SupplyStockMovementType.USAGE,
      ],
    );
    return row;
  }
}

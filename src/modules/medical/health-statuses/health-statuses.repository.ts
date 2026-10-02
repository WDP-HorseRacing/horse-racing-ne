import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';

/**
 * Một lần đổi trạng thái sức khỏe, đọc thô từ nhật ký.
 */
export interface HealthHistoryRow {
  changedAt: Date;
  from: HorseHealthStatus | null;
  to: HorseHealthStatus;
  reason: string | null;
  feature: string | null;
  actorId: string | null;
}

@Injectable()
export class HealthStatusesRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lịch sử trạng thái sức khỏe của con ngựa, dựng từ nhật ký HORSE có trường healthStatus, mới nhất lên trên
   *
   * - Gồm đổi trực tiếp, đổi trong buổi khám và hệ thống đặt lại khi kích hoạt lại
   * - Bỏ các dòng trạng thái trước và sau trùng nhau (ví dụ kích hoạt lại khi ngựa đã đang Cần theo dõi)
   * - Chỉ đọc bảng audit_logs, dùng index audit_logs_entity_idx
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về các lần đổi trạng thái sức khỏe
   */
  history(horseId: string): Promise<HealthHistoryRow[]> {
    return this.dataSource.query(
      `SELECT created_at AS "changedAt",
              before_data->>'healthStatus' AS "from",
              after_data->>'healthStatus' AS "to",
              reason,
              feature,
              actor_id AS "actorId"
         FROM audit_logs
        WHERE entity_type = $1
          AND entity_id = $2
          AND after_data ? 'healthStatus'
          AND before_data->>'healthStatus' IS DISTINCT FROM after_data->>'healthStatus'
        ORDER BY created_at DESC`,
      [AuditEntityType.HORSE, horseId],
    );
  }
}

import type {
  AuditLogDetailDto,
  AuditLogSummaryDto,
} from '../dto/audit-log.dto';
import type { AuditLogEntity } from '../entities/audit-log.entity';

/**
 * Dựng một dòng nhật ký cho danh sách, không kèm dữ liệu trước và sau
 *
 * - Không có người thực hiện (thao tác của hệ thống): actor là null
 *
 * @param log Dòng nhật ký đã nạp kèm người thực hiện
 * @returns AuditLogSummaryDto của dòng nhật ký
 */
export function toAuditLogSummary(log: AuditLogEntity): AuditLogSummaryDto {
  return {
    id: log.id,
    createdAt: log.createdAt,
    actor: log.actor
      ? { id: log.actor.id, fullName: log.actor.fullName, role: log.actor.role }
      : null,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    reason: log.reason,
    feature: log.feature,
  };
}

/**
 * Dựng chi tiết một dòng nhật ký, kèm dữ liệu trước và sau
 *
 * @param log Dòng nhật ký đã nạp kèm người thực hiện
 * @returns AuditLogDetailDto của dòng nhật ký
 */
export function toAuditLogDetail(log: AuditLogEntity): AuditLogDetailDto {
  return {
    ...toAuditLogSummary(log),
    before: log.beforeData,
    after: log.afterData,
  };
}

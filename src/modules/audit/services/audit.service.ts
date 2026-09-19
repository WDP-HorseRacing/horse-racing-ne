import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction } from '../constants/audit-action.enum';
import { AuditEntityType } from '../constants/audit-entity-type.enum';
import { AuditLogEntity } from '../entities/audit-log.entity';

/**
 * Một dòng nhật ký cần ghi: ai làm gì, trên bản ghi nào, giá trị trước và sau.
 */
export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  /**
   * Ghi một dòng nhật ký thao tác vào bảng audit_logs.
   *
   * - Truyền EntityManager của transaction đang chạy để nhật ký chỉ được lưu khi thao tác chính thành công
   * - correlationId tạm để null vì Actor chưa mang correlationId của request
   *
   * @param manager EntityManager của transaction đang chạy
   * @param entry Nội dung nhật ký
   * @returns Promise hoàn tất khi đã ghi
   */
  async record(manager: EntityManager, entry: AuditEntry): Promise<void> {
    await manager.getRepository(AuditLogEntity).save({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeData: entry.before,
      afterData: entry.after,
      correlationId: null,
    });
  }
}

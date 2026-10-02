import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../entities/horse.entity';
import { HorseHealthStatus } from '../enums/horse-status.enum';

/**
 * Kết quả ghi trạng thái sức khỏe: changed = false khi trạng thái mới trùng trạng thái cũ.
 */
export interface HealthStatusChange {
  changed: boolean;
  from: HorseHealthStatus;
  to: HorseHealthStatus;
}

/**
 * Ghi trạng thái sức khỏe ngựa cho module khác gọi trong transaction của họ (export qua HorsesSharedModule).
 */
@Injectable()
export class HorseHealthService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Ghi trạng thái sức khỏe của con ngựa (cột horses.health_status do module horses sở hữu). Dùng cho module medical gọi trong transaction của họ.
   *
   * - Trạng thái mới trùng trạng thái cũ thì không ghi gì, không ghi nhật ký
   * - Có thay đổi thì cập nhật cột và ghi một dòng nhật ký HORSE kèm giá trị trước, sau và lý do
   * - Không kiểm quyền, lý do bắt buộc hay vòng đời: nơi gọi đã khóa row ngựa và kiểm các luật đó
   * - Không publish event; nơi gọi tự phát sau khi commit
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Ngựa, trạng thái mới, người đổi, lý do và mã chức năng ghi nhật ký
   * @returns Promise trả về trạng thái trước, sau và cờ có thay đổi hay không
   */
  async applyHealthStatus(
    manager: EntityManager,
    input: {
      horseId: string;
      to: HorseHealthStatus;
      actorId: string;
      reason: string;
      feature: string;
    },
  ): Promise<HealthStatusChange> {
    const horse = await manager.findOneOrFail(HorseEntity, {
      where: { id: input.horseId },
      withDeleted: true,
    });
    const from = horse.healthStatus;
    if (from === input.to) return { changed: false, from, to: input.to };
    await manager
      .getRepository(HorseEntity)
      .update({ id: input.horseId }, { healthStatus: input.to });
    await this.audit.record(manager, {
      actorId: input.actorId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.HORSE,
      entityId: input.horseId,
      before: { healthStatus: from },
      after: { healthStatus: input.to },
      reason: input.reason,
      feature: input.feature,
    });
    return { changed: true, from, to: input.to };
  }
}

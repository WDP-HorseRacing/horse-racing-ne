import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BarnsService } from '../../stable/barns/barns.service';
import { StallsService } from '../../stable/stalls/stalls.service';
import { AssignHorseBarnDto, HorseResponseDto } from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import { toHorseResponse } from '../mappers/horse.mapper';
import { HORSE_BARN_ASSIGNED_EVENT } from '../constants/horse.constants';
import { HorseAccessService } from '../shared/horse-access.service';
import type { HorseBarnAssignedEvent } from '../types/horse.types';

/**
 * Xếp và đổi khu chuồng cho ngựa (F1.6). Việc xếp ô và phân công Groom (F1.7) thuộc module stable.
 */
@Injectable()
export class HorsePlacementsService {
  constructor(
    private readonly access: HorseAccessService,
    private readonly barns: BarnsService,
    private readonly stalls: StallsService,
    private readonly events: DomainEventPublisher,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Xếp hoặc đổi khu chuồng cho ngựa (F1.6). Chỉ Club Manager (kiểm ở controller).
   *
   * - Chỉ ngựa ACTIVE hoặc RETIRED; ngựa đã chuyển nhượng hoặc hồ sơ đã xóa thì không thao tác được
   * - Khu mới phải đang hoạt động, có Head Trainer phụ trách và còn ít nhất một ô trống (khóa row khu trước khi kiểm)
   * - Đổi khu: trả ô cũ về trống, ngựa vào "Chờ xếp ô" của khu mới; giữ nguyên Groom vì Groom gắn với con ngựa
   * - Chọn đúng khu đang ở thì không đổi gì
   * - Bắt buộc lý do; ghi nhật ký; sau khi commit phát HORSE_BARN_ASSIGNED_EVENT để module notifications báo Head Trainer khu mới
   * - Rút ngựa khỏi lớp của Head Trainer khu cũ đang chờ Flow 2 làm mô hình lớp học
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Khu mới và lý do
   * @returns Promise trả về hồ sơ ngựa sau khi xếp khu
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc hồ sơ đã xóa (phải khôi phục trước)
   * @throws NotFoundException Nếu không có ngựa hoặc không có khu
   * @throws ConflictException Nếu ngựa đã chuyển nhượng, hoặc khu không hoạt động, chưa có Head Trainer, hết ô trống
   */
  async assignBarn(
    actor: Actor,
    horseId: string,
    body: AssignHorseBarnDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    const changed = await this.dataSource.transaction(async (manager) => {
      const horse = await this.access.lockWritableHorse(
        manager,
        actor,
        horseId,
      );
      this.access.assertNotTransferred(horse);
      if (horse.barnId === body.barnId) return false;
      await this.barns.lockAssignableBarn(manager, body.barnId);
      const released = await this.stalls.releaseStallByHorse(manager, horseId);
      await manager
        .getRepository(HorseEntity)
        .update({ id: horseId }, { barnId: body.barnId });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE,
        entityId: horseId,
        before: {
          barnId: horse.barnId,
          stallCode: released?.stallCode ?? null,
        },
        after: { barnId: body.barnId, stallCode: null },
        reason: body.reason,
        feature: 'F1.6',
      });
      return true;
    });
    if (changed) {
      const event: HorseBarnAssignedEvent = {
        eventId: randomUUID(),
        horseId,
        barnId: body.barnId,
      };
      this.events.publish(HORSE_BARN_ASSIGNED_EVENT, event);
    }
    return toHorseResponse(await this.access.findHorse(horseId));
  }
}

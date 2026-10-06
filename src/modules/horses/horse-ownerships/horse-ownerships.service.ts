import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { MedicalAccessService } from '../../medical/shared/medical-access.service';
import {
  HORSE_AUDIT_FEATURE,
  HORSE_OWNERSHIP_TRANSFERRED_EVENT,
  OPEN_CASE_BLOCKS_OWNERSHIP_TRANSFER_MESSAGE,
  STALE_HORSE_MESSAGE,
} from '../constants/horse.constants';
import type {
  CreateOwnershipTransferDto,
  HorseOwnershipResponseDto,
  HorseResponseDto,
} from '../dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import { toOwnershipHistory } from '../mappers/horse-ownerships.mapper';
import { toHorseResponse } from '../mappers/horse.mapper';
import { assertOwnershipTransfer } from '../policies/horse-ownership.policy';
import { assertAssignableOwner } from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnershipService } from '../shared/horse-ownership.service';
import type { HorseOwnershipTransferredEvent } from '../types/horse.types';

@Injectable()
export class HorseOwnershipsService {
  constructor(
    @InjectRepository(HorseOwnershipEntity)
    private readonly ownershipRecords: Repository<HorseOwnershipEntity>,
    private readonly access: HorseAccessService,
    private readonly ownerships: HorseOwnershipService,
    private readonly medicalAccess: MedicalAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Chuyển nhượng nội bộ ngựa sang một chủ khác trong câu lạc bộ, trong cùng một transaction
   *
   * - Khóa row ngựa; hồ sơ đã xóa: Club Manager nhận 409, phải khôi phục trước
   * - Kiểm lần lượt: version, luật chuyển nhượng (assertOwnershipTransfer), chủ mới là HORSE_OWNER đang hoạt động (khóa chia sẻ row tài khoản), ngựa không còn bệnh án đang mở
   * - Đóng giai đoạn sở hữu hiện tại và mở giai đoạn mới tại thời điểm ghi nhận (chủ mới bắt đầu sở hữu từ lúc này); cập nhật horses.owner_id và tăng version
   * - Không đổi vòng đời, khu, ô, Groom, lớp
   * - Ghi nhật ký kèm lý do và ghi HORSE_OWNERSHIP_TRANSFERRED_EVENT vào outbox để báo chủ cũ và chủ mới
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Chủ mới, lý do và version
   * @returns Promise trả về hồ sơ ngựa sau khi chuyển
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws BadRequestException Nếu chủ mới trùng chủ hiện tại hoặc không phải HORSE_OWNER
   * @throws ConflictException Nếu Club Manager thao tác hồ sơ đã xóa, version đã cũ, ngựa đã chuyển nhượng hoặc đã mất, ngựa chưa có chủ, chủ mới không còn hoạt động, hoặc ngựa còn bệnh án đang mở
   */
  async transfer(
    actor: Actor,
    horseId: string,
    body: CreateOwnershipTransferDto,
  ): Promise<HorseResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const horse = await this.access.lockWritableHorse(
        manager,
        actor,
        horseId,
      );
      if (horse.version !== body.version) {
        throw new ConflictException(STALE_HORSE_MESSAGE);
      }
      assertOwnershipTransfer({
        lifecycleStatus: horse.lifecycleStatus,
        currentOwnerId: horse.ownerId,
        newOwnerId: body.newOwnerId,
      });
      const fromOwnerId = horse.ownerId as string;
      assertAssignableOwner(
        await this.access.lockOwnerAccount(manager, body.newOwnerId),
      );
      if (await this.medicalAccess.findOpenCase(horseId, manager)) {
        throw new ConflictException(
          OPEN_CASE_BLOCKS_OWNERSHIP_TRANSFER_MESSAGE,
        );
      }
      const result = await manager
        .getRepository(HorseEntity)
        .update(
          { id: horseId, version: body.version },
          { ownerId: body.newOwnerId },
        );
      if (!result.affected) {
        throw new ConflictException(STALE_HORSE_MESSAGE);
      }
      const transferredAt = new Date();
      await this.ownerships.recordOwnerChange(manager, {
        horseId,
        ownerId: body.newOwnerId,
        at: transferredAt,
        reason: body.reason,
        recordedBy: caller.id,
      });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE,
        entityId: horseId,
        before: { ownerId: fromOwnerId },
        after: { ownerId: body.newOwnerId },
        reason: body.reason,
        feature: HORSE_AUDIT_FEATURE.UPDATE_PROFILE,
      });
      const event: HorseOwnershipTransferredEvent = {
        eventId: randomUUID(),
        horseId,
        fromOwnerId,
        toOwnerId: body.newOwnerId,
        transferredAt: transferredAt.toISOString(),
      };
      await this.events.publish(
        manager,
        HORSE_OWNERSHIP_TRANSFERRED_EVENT,
        event,
      );
    });
    return toHorseResponse(await this.access.findNotDeletedHorse(horseId));
  }

  /**
   * Lấy lịch sử sở hữu của ngựa, mới nhất lên trên
   *
   * - Ai xem được hồ sơ thì xem được lịch sử, theo luật của findReadableHorse
   * - Horse Owner chỉ thấy các giai đoạn của chính mình
   * - Đọc cả tài khoản chủ và người ghi nhận đã bị xóa mềm
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về các giai đoạn sở hữu
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async history(
    actor: Actor,
    horseId: string,
  ): Promise<HorseOwnershipResponseDto[]> {
    const caller = await this.access.currentUser(actor);
    await this.access.findReadableHorse(
      this.dataSource.manager,
      actor,
      caller.id,
      horseId,
    );
    const periods = await this.ownershipRecords.find({
      where: { horseId },
      relations: { owner: true, recorder: true },
      withDeleted: true,
      order: { startedAt: 'ASC' },
    });
    const ownerView = this.access.scopeOf(actor, caller.id).kind === 'OWNER';
    return toOwnershipHistory(periods, ownerView ? caller.id : null);
  }
}

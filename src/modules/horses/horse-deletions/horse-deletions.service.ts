import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BarnEntity } from '../../stable/entities/barn.entity';
import {
  DeleteHorseDto,
  HorseDeletionPreviewResponseDto,
  HorseResponseDto,
  HorseRestorePreviewResponseDto,
  RestoreHorseDto,
} from '../dto';
import { HORSE_AUDIT_FEATURE } from '../constants/horse.constants';
import { HorseEntity } from '../entities/horse.entity';
import {
  toDeletionPreviewResponse,
  toRestorePreviewResponse,
} from '../mappers/horse-deletions.mapper';
import { toHorseResponse } from '../mappers/horse.mapper';
import {
  assertDeletedHorse,
  assertNoBusinessData,
  assertNotParent,
  assertLifecycleWritable,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnershipService } from '../shared/horse-ownership.service';
import { HorsePedigreeService } from '../shared/horse-pedigree.service';
import { HorseDeletionsRepository } from './horse-deletions.repository';

/**
 * Xóa hồ sơ ngựa tạo nhầm và khôi phục hồ sơ đã xóa. Chỉ Club Manager (kiểm ở controller).
 */
@Injectable()
export class HorseDeletionsService {
  constructor(
    private readonly deletions: HorseDeletionsRepository,
    private readonly access: HorseAccessService,
    private readonly pedigree: HorsePedigreeService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly ownerships: HorseOwnershipService,
  ) {}

  /**
   * Xóa mềm hồ sơ ngựa tạo nhầm. Chỉ xóa được khi ngựa chưa từng phát sinh dữ liệu nghiệp vụ
   *
   * - Khóa phả hệ và row ngựa trước khi kiểm tra
   * - Ngựa đã có dữ liệu nghiệp vụ thì báo rõ đang vướng loại dữ liệu nào; đang là cha/mẹ của ngựa khác (kể cả con đã xóa) cũng bị chặn
   * - Số chip vẫn bị coi là đã dùng; dữ liệu lịch sử và nhật ký không bị xóa theo
   * - Lưu lý do xóa và ghi nhật ký kèm lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Lý do xóa
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu hồ sơ đã bị xóa trước đó, ngựa đã chuyển nhượng hoặc đã mất (hồ sơ chỉ đọc), đã có dữ liệu nghiệp vụ hoặc đang là cha/mẹ trong phả hệ
   */
  async remove(actor: Actor, id: string, body: DeleteHorseDto): Promise<void> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      // Xin khoá phả hệ
      await this.pedigree.lockPedigree(manager);
      // Khoá con ngựa nếu con ngựa cho phép sửa (chưa xoá)
      const horse = await this.access.lockWritableHorse(manager, actor, id);
      // Ngưa chưa chuyển nhượng
      assertLifecycleWritable(horse);
      // Ngưa chưa phát sinh dữ liệu nghiệp vụ
      assertNoBusinessData(
        await this.deletions.businessDataLabels(manager, id),
      );
      // Ngưa k phải cha hay mẹ của một con ngựa khác
      assertNotParent(await this.pedigree.parentUsage(manager, id));
      const horses = manager.getRepository(HorseEntity);
      await horses.update({ id }, { deletedReason: body.reason });
      await horses.softDelete({ id });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.HORSE,
        entityId: id,
        before: {
          name: horse.name,
          microchipId: horse.microchipId,
          lifecycleStatus: horse.lifecycleStatus,
        },
        after: { deletedReason: body.reason },
        reason: body.reason,
        feature: HORSE_AUDIT_FEATURE.LIFECYCLE_AND_DELETION,
      });
    });
  }

  /**
   * Xem trước việc xóa hồ sơ ngựa: xóa được không và đang vướng gì. Không ghi gì
   *
   * - Dùng cùng các luật chặn như remove: đã chuyển nhượng hoặc đã mất, đã có dữ liệu nghiệp vụ, đang là cha/mẹ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns Promise trả về cờ xóa được và từng lý do chặn
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu hồ sơ đã bị xóa
   */
  async previewRemove(
    actor: Actor,
    id: string,
  ): Promise<HorseDeletionPreviewResponseDto> {
    await this.access.currentUser(actor);
    const horse = await this.access.findWritableHorse(actor, id);
    const manager = this.dataSource.manager;
    const [businessData, parentUsage] = await Promise.all([
      this.deletions.businessDataLabels(manager, id),
      this.pedigree.parentUsage(manager, id),
    ]);
    return toDeletionPreviewResponse(horse, businessData, parentUsage);
  }

  /**
   * Xem trước hệ quả khi khôi phục hồ sơ đã xóa, không ghi gì
   *
   * - Ngựa có khu: báo tên khu sẽ rời (khôi phục luôn đưa ngựa vào Chờ xếp khu)
   * - Ngựa có chủ không còn là HORSE_OWNER đang hoạt động: báo tên chủ sẽ bị bỏ trống
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns Promise trả về các hệ quả và câu tóm tắt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có hồ sơ ngựa
   * @throws ConflictException Nếu hồ sơ chưa bị xóa
   */
  async previewRestore(
    actor: Actor,
    id: string,
  ): Promise<HorseRestorePreviewResponseDto> {
    await this.access.currentUser(actor);
    const horse = await this.access.findByIdWithDeleted(id);
    assertDeletedHorse(horse);
    const manager = this.dataSource.manager;
    const [barnCleared, ownerCleared] = await Promise.all([
      horse.barnId ? this.barnName(manager, horse.barnId) : null,
      horse.ownerId
        ? this.access.invalidOwnerName(horse.ownerId, manager)
        : null,
    ]);
    return toRestorePreviewResponse(horse, barnCleared, ownerCleared);
  }

  /**
   * Khôi phục hồ sơ ngựa đã xóa
   *
   * - Bỏ dấu đã xóa và lý do xóa; vòng đời, sức khỏe, phả hệ giữ nguyên
   * - Ngựa có khu: luôn bỏ khu, ngựa vào "Chờ xếp khu"
   * - Ngựa có chủ: chủ không còn là HORSE_OWNER đang hoạt động thì bỏ trống chủ và đóng giai đoạn sở hữu của chủ cũ, Club Manager chọn chủ mới sau
   * - Không kiểm lại phả hệ
   * - Không kiểm lại số chip (hồ sơ đã xóa vẫn giữ số chip của nó)
   * - Ghi nhật ký RESTORE kèm lý do; khu hoặc chủ bị bỏ trống thì ghi cả giá trị cũ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Lý do khôi phục
   * @returns Promise trả về hồ sơ sau khi khôi phục
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có hồ sơ ngựa
   * @throws ConflictException Nếu hồ sơ chưa bị xóa
   */
  async restore(
    actor: Actor,
    id: string,
    body: RestoreHorseDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      const horse = await this.access.lockHorseWithDeleted(manager, id);
      assertDeletedHorse(horse);
      const clearBarn = horse.barnId !== null;
      const shouldClearOwner =
        horse.ownerId !== null &&
        !(await this.access.lockActiveHorseOwner(manager, horse.ownerId));
      const cleared = {
        ...(clearBarn ? { barnId: null } : {}),
        ...(shouldClearOwner ? { ownerId: null } : {}),
      };
      const horses = manager.getRepository(HorseEntity);
      await horses.restore({ id });
      await horses.update({ id }, { deletedReason: null, ...cleared });
      if (shouldClearOwner) {
        await this.ownerships.recordOwnerChange(manager, {
          horseId: id,
          ownerId: null,
          at: new Date(),
          recordedBy: caller.id,
        });
      }
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.RESTORE,
        entityType: AuditEntityType.HORSE,
        entityId: id,
        before: {
          deletedAt: horse.deletedAt,
          deletedReason: horse.deletedReason,
          ...(clearBarn ? { barnId: horse.barnId } : {}),
          ...(shouldClearOwner ? { ownerId: horse.ownerId } : {}),
        },
        after: { deletedAt: null, deletedReason: null, ...cleared },
        reason: body.reason,
        feature: HORSE_AUDIT_FEATURE.LIFECYCLE_AND_DELETION,
      });
    });
    return toHorseResponse(await this.access.findNotDeletedHorse(id));
  }

  /**
   * Lấy tên khu theo id, kể cả khu đã xóa mềm
   *
   * @param manager EntityManager dùng để query
   * @param barnId UUID của khu
   * @returns Promise trả về tên khu, hoặc null nếu không có khu đó
   */
  private async barnName(
    manager: EntityManager,
    barnId: string,
  ): Promise<string | null> {
    const barn = await manager.findOne(BarnEntity, {
      select: { name: true },
      where: { id: barnId },
      withDeleted: true,
    });
    return barn?.name ?? null;
  }
}

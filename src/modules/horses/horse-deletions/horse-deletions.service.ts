import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  DeleteHorseDto,
  HorseDeletionPreviewResponseDto,
  HorseResponseDto,
  HorseRestorePreviewResponseDto,
  RestoreHorseDto,
} from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import {
  toDeletionPreviewResponse,
  toRestorePreviewResponse,
} from '../mappers/horse-deletions.mapper';
import { toHorseResponse } from '../mappers/horse.mapper';
import {
  assertNoBusinessData,
  assertNotParent,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsePedigreeService } from '../shared/horse-pedigree.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorseDeletionsRepository } from './horse-deletions.repository';

/**
 * Xóa hồ sơ ngựa tạo nhầm và khôi phục hồ sơ đã xóa (F1.8). Chỉ Club Manager (kiểm ở controller).
 */
@Injectable()
export class HorseDeletionsService {
  constructor(
    private readonly deletions: HorseDeletionsRepository,
    private readonly horses: HorsesSharedRepository,
    private readonly access: HorseAccessService,
    private readonly pedigree: HorsePedigreeService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Xóa mềm hồ sơ ngựa tạo nhầm (F1.8). Chỉ xóa được khi ngựa chưa từng phát sinh dữ liệu nghiệp vụ
   *
   * - Khóa phả hệ và row ngựa trước rồi mới kiểm tra, tránh vừa kiểm tra xong thì có dữ liệu mới
   * - Ngựa đã có dữ liệu nghiệp vụ thì báo rõ đang vướng loại dữ liệu nào; đang là cha/mẹ của ngựa khác (kể cả con đã xóa) cũng bị chặn
   * - Số chip vẫn bị coi là đã dùng; dữ liệu lịch sử và nhật ký không bị xóa theo
   * - Lưu lý do xóa và ghi nhật ký kèm lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Lý do xóa
   * @returns A promise resolving khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu hồ sơ đã bị xóa trước đó, ngựa đã chuyển nhượng (hồ sơ chỉ đọc), đã có dữ liệu nghiệp vụ hoặc đang là cha/mẹ trong phả hệ
   */
  async remove(actor: Actor, id: string, body: DeleteHorseDto): Promise<void> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      await this.pedigree.lockPedigree(manager);
      const horse = await this.access.lockWritableHorse(manager, actor, id);
      this.access.assertNotTransferred(horse);
      assertNoBusinessData(
        await this.deletions.businessDataLabels(id, manager),
      );
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
        feature: 'F1.8',
      });
    });
  }

  /**
   * Xem trước việc xóa hồ sơ ngựa: xóa được không và đang vướng gì. Không ghi gì
   *
   * - Dùng cùng các luật chặn như remove: đã chuyển nhượng, đã có dữ liệu nghiệp vụ, đang là cha/mẹ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns A promise resolving to cờ xóa được và từng lý do chặn
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
      this.deletions.businessDataLabels(id, manager),
      this.pedigree.parentUsage(manager, id),
    ]);
    return toDeletionPreviewResponse(horse, businessData, parentUsage);
  }

  /**
   * Xem trước hệ quả khi khôi phục hồ sơ đã xóa, không ghi gì (F1.8 mục 4, 5)
   *
   * - Ngựa có khu: báo tên khu sẽ rời (khôi phục luôn đưa ngựa vào Chờ xếp khu)
   * - Ngựa có chủ không còn là HORSE_OWNER đang hoạt động: báo tên chủ sẽ bị bỏ trống
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns A promise resolving to các hệ quả và câu tóm tắt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có hồ sơ ngựa
   * @throws ConflictException Nếu hồ sơ chưa bị xóa
   */
  async previewRestore(
    actor: Actor,
    id: string,
  ): Promise<HorseRestorePreviewResponseDto> {
    await this.access.currentUser(actor);
    const horse = await this.horses.findByIdWithDeleted(id);
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    if (horse.deletedAt === null) {
      throw new ConflictException('Hồ sơ ngựa chưa bị xóa');
    }
    const manager = this.dataSource.manager;
    const [barnCleared, ownerCleared] = await Promise.all([
      horse.barnId ? this.deletions.barnName(horse.barnId, manager) : null,
      horse.ownerId
        ? this.horses.inactiveOwnerName(horse.ownerId, manager)
        : null,
    ]);
    return toRestorePreviewResponse(horse, barnCleared, ownerCleared);
  }

  /**
   * Khôi phục hồ sơ ngựa đã xóa (F1.8, A2). Hồ sơ trở về trạng thái trước khi xóa
   *
   * - Bỏ dấu đã xóa và lý do xóa; vòng đời, sức khỏe, phả hệ giữ nguyên
   * - Ngựa có khu: luôn bỏ khu, ngựa vào "Chờ xếp khu", vì lúc xóa hồ sơ chỗ của ngựa trong khu đã nhả cho ngựa khác
   * - Ngựa có chủ: chủ không còn là HORSE_OWNER đang hoạt động thì bỏ trống chủ (quyết định 2026-09-23), Club Manager chọn chủ mới sau
   * - Phả hệ không cần kiểm lại: trong lúc hồ sơ bị xóa, cha mẹ không đổi được giới tính và ngày sinh trái với con đã xóa (luật phả hệ tính cả con đã xóa), và hồ sơ đã xóa không chọn làm cha mẹ được
   * - Số chip không bị trùng vì hồ sơ đã xóa vẫn giữ chỗ của số chip
   * - Ghi nhật ký RESTORE kèm lý do; khu hoặc chủ bị bỏ trống thì ghi cả giá trị cũ
   * - Giao diện gọi previewRestore trước để hiện bảng xác nhận
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Lý do khôi phục
   * @returns A promise resolving to hồ sơ sau khi khôi phục
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
      const horse = await this.horses.lockHorseWithDeleted(manager, id);
      if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
      if (horse.deletedAt === null) {
        throw new ConflictException('Hồ sơ ngựa chưa bị xóa');
      }
      const clearBarn = horse.barnId !== null;
      const clearOwner =
        horse.ownerId !== null &&
        !(await this.horses.lockActiveHorseOwner(manager, horse.ownerId));
      const cleared = {
        ...(clearBarn ? { barnId: null } : {}),
        ...(clearOwner ? { ownerId: null } : {}),
      };
      const horses = manager.getRepository(HorseEntity);
      await horses.restore({ id });
      await horses.update({ id }, { deletedReason: null, ...cleared });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.RESTORE,
        entityType: AuditEntityType.HORSE,
        entityId: id,
        before: {
          deletedAt: horse.deletedAt,
          deletedReason: horse.deletedReason,
          ...(clearBarn ? { barnId: horse.barnId } : {}),
          ...(clearOwner ? { ownerId: horse.ownerId } : {}),
        },
        after: { deletedAt: null, deletedReason: null, ...cleared },
        reason: body.reason,
        feature: 'F1.8',
      });
    });
    return toHorseResponse(await this.access.findHorse(id));
  }
}

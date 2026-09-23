import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BarnsService } from '../../stable/barns/barns.service';
import { DeleteHorseDto, HorseResponseDto, RestoreHorseDto } from '../dto';
import { HorseEntity } from '../entities/horse.entity';
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
    private readonly barns: BarnsService,
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
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc hồ sơ đã bị xóa trước đó
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu ngựa đã chuyển nhượng (hồ sơ chỉ đọc), đã có dữ liệu nghiệp vụ hoặc đang là cha/mẹ trong phả hệ
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
   * Khôi phục hồ sơ ngựa đã xóa (F1.8, A2). Hồ sơ trở về trạng thái trước khi xóa
   *
   * - Bỏ dấu đã xóa và lý do xóa; vòng đời, sức khỏe, phả hệ giữ nguyên
   * - Ngựa có khu: kiểm lại khu (khóa row khu) như lúc xếp khu. Khu vẫn nhận được thì giữ; hết chỗ, ngừng hoạt động, không còn Head Trainer đang hoạt động hoặc đã bị xóa thì bỏ khu, ngựa vào "Chờ xếp khu" (BA chốt 2026-09-23, Q-1 B)
   * - Ngựa có chủ: chủ không còn là HORSE_OWNER đang hoạt động thì bỏ trống chủ (quyết định 2026-09-23), Club Manager chọn chủ mới sau
   * - Phả hệ không cần kiểm lại: trong lúc hồ sơ bị xóa, cha mẹ không đổi được giới tính và ngày sinh trái với con đã xóa (luật phả hệ tính cả con đã xóa), và hồ sơ đã xóa không chọn làm cha mẹ được
   * - Số chip không bị trùng vì hồ sơ đã xóa vẫn giữ chỗ của số chip
   * - Ghi nhật ký RESTORE kèm lý do; khu hoặc chủ bị bỏ trống thì ghi cả giá trị cũ
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
      const clearBarn =
        horse.barnId !== null &&
        !(await this.canKeepBarn(manager, horse.barnId));
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

  /**
   * Kiểm tra khu cũ còn nhận lại được ngựa khi khôi phục hồ sơ, dùng đúng luật xếp khu của stable (khóa row khu)
   *
   * @param manager EntityManager của transaction khôi phục
   * @param barnId UUID khu cũ của ngựa
   * @returns A promise resolving to true nếu khu còn nhận được, false nếu khu hết chỗ, ngừng hoạt động, không có Head Trainer đang hoạt động hoặc đã bị xóa
   * @throws Error Nếu gặp lỗi khác ngoài 409/404 của việc kiểm khu
   */
  private async canKeepBarn(
    manager: EntityManager,
    barnId: string,
  ): Promise<boolean> {
    try {
      await this.barns.lockAssignableBarn(manager, barnId);
      return true;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        return false;
      }
      throw error;
    }
  }
}

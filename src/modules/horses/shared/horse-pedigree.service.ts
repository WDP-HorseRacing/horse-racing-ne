import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EntityManager, IsNull, Not } from 'typeorm';
import { HorseEntity } from '../entities/horse.entity';
import {
  assertBornBeforeChildren,
  assertGenderKeepsPedigree,
  assertParentIds,
  assertParentProfiles,
} from '../policies/horse.policy';
import type { ChildProfile, ParentUsage } from '../types/horse.types';
import { HorseAccessService } from './horse-access.service';
import { HorsePedigreeRepository } from './horse-pedigree.repository';

/**
 * Nhãn của cha trong thông báo lỗi
 */
const SIRE_LABEL = 'Sire';

/**
 * Nhãn của mẹ trong thông báo lỗi
 */
const DAM_LABEL = 'Dam';

/**
 * Luật phả hệ dùng chung cho tạo/sửa hồ sơ (horse-profiles) và xóa hồ sơ (horse-deletions).
 *
 * - Mọi hàm kiểm tra phải chạy trong transaction đã gọi lockPedigree
 */
@Injectable()
export class HorsePedigreeService {
  constructor(
    private readonly pedigree: HorsePedigreeRepository,
    private readonly access: HorseAccessService,
  ) {}

  /**
   * Giữ khóa phả hệ tới hết transaction; các thao tác đổi phả hệ chạy lần lượt
   *
   * @param manager EntityManager của transaction đang chạy
   * @returns Promise hoàn tất khi đã giữ được khóa
   */
  lockPedigree(manager: EntityManager): Promise<void> {
    return this.pedigree.lockPedigree(manager);
  }

  /**
   * Kiểm tra con ngựa đang là cha hoặc mẹ của ngựa khác, tính cả con đã xóa hồ sơ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param horseId UUID của ngựa
   * @returns Promise trả về cờ đang là cha (asSire) và đang là mẹ (asDam)
   */
  async parentUsage(
    manager: EntityManager,
    horseId: string,
  ): Promise<ParentUsage> {
    const horses = manager.getRepository(HorseEntity);
    const [asSire, asDam] = await Promise.all([
      horses.exists({ where: { sireId: horseId }, withDeleted: true }),
      horses.exists({ where: { damId: horseId }, withDeleted: true }),
    ]);
    return { asSire, asDam };
  }

  /**
   * Kiểm tra cha mẹ của một con ngựa theo hồ sơ của cha mẹ và phả hệ hiện có
   *
   * - Cha mẹ không trùng nhau, không phải chính con ngựa
   * - Cha mẹ phải có hồ sơ tại câu lạc bộ (chưa xóa), đúng giới tính, sinh trước con
   * - Ngựa đã có id (đang sửa): cha mẹ mới không được tạo vòng lặp phả hệ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param child Id (khi sửa) và ngày sinh của ngựa con
   * @param sireId UUID của cha, null nếu bỏ trống
   * @param damId UUID của mẹ, null nếu bỏ trống
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws BadRequestException Nếu cha/mẹ là chính ngựa con, trùng nhau, không tồn tại, sai giới tính hoặc không sinh trước con
   * @throws ConflictException Nếu cha/mẹ tạo vòng lặp phả hệ
   */
  async validateParents(
    manager: EntityManager,
    child: ChildProfile,
    sireId: string | null,
    damId: string | null,
  ): Promise<void> {
    assertParentIds(child.id, sireId, damId);
    const sire = sireId
      ? await this.findParent(manager, sireId, SIRE_LABEL)
      : null;
    const dam = damId ? await this.findParent(manager, damId, DAM_LABEL) : null;
    assertParentProfiles(child, sire, dam);

    const childId = child.id;
    if (!childId) return;
    for (const parent of [sire, dam]) {
      if (
        parent &&
        (await this.pedigree.wouldCreateCycle(manager, childId, parent.id))
      ) {
        throw new ConflictException('Quan hệ cha/mẹ tạo thành vòng lặp phả hệ');
      }
    }
  }

  /**
   * Kiểm tra thay đổi phả hệ của một con ngựa khi đang giữ khóa phả hệ
   *
   * - Đổi giới tính: không làm sai vai trò sire/dam của ngựa khác
   * - Đổi cha/mẹ hoặc ngày sinh: cha/mẹ hợp lệ, không tạo vòng lặp phả hệ; cha/mẹ giữ nguyên mà đã xóa hồ sơ thì bỏ qua
   * - Đổi ngày sinh: vẫn sinh trước ngựa con sớm nhất, tính cả con đã xóa hồ sơ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param horse Hồ sơ ngựa trước khi sửa
   * @param changes Các field thực sự đổi
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws BadRequestException Nếu cha/mẹ không hợp lệ hoặc ngày sinh không trước ngựa con sớm nhất
   * @throws ConflictException Nếu đổi giới tính làm sai phả hệ, hoặc cha/mẹ tạo vòng lặp phả hệ
   */
  async assertPedigreeChange(
    manager: EntityManager,
    horse: HorseEntity,
    changes: Partial<HorseEntity>,
  ): Promise<void> {
    if (changes.gender) {
      assertGenderKeepsPedigree(
        await this.parentUsage(manager, horse.id),
        changes.gender,
      );
    }
    if ('sireId' in changes || 'damId' in changes || 'dateOfBirth' in changes) {
      const child: ChildProfile = {
        id: horse.id,
        dateOfBirth: this.nextBirthDate(horse, changes),
      };
      const sireId = await this.nextParentId(
        manager,
        changes.sireId,
        horse.sireId,
      );
      const damId = await this.nextParentId(
        manager,
        changes.damId,
        horse.damId,
      );
      await this.validateParents(manager, child, sireId, damId);
    }
    if (changes.dateOfBirth) {
      assertBornBeforeChildren(
        changes.dateOfBirth,
        await this.earliestChildBirthDate(manager, horse.id),
      );
    }
  }

  /**
   * Lấy ngày sinh sớm nhất trong các ngựa con của một con ngựa, tính cả con đã xóa hồ sơ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param horseId UUID của ngựa cha/mẹ
   * @returns Promise trả về ngày sinh sớm nhất (YYYY-MM-DD), null nếu không có con nào có ngày sinh
   */
  private async earliestChildBirthDate(
    manager: EntityManager,
    horseId: string,
  ): Promise<string | null> {
    const child = await manager.getRepository(HorseEntity).findOne({
      select: { id: true, dateOfBirth: true },
      where: [
        { sireId: horseId, dateOfBirth: Not(IsNull()) },
        { damId: horseId, dateOfBirth: Not(IsNull()) },
      ],
      order: { dateOfBirth: 'ASC' },
      withDeleted: true,
    });
    return child?.dateOfBirth ?? null;
  }

  /**
   * Lấy ngày sinh của ngựa sau khi sửa
   *
   * @param horse Hồ sơ ngựa trước khi sửa
   * @param changes Các field thực sự đổi
   * @returns Ngày sinh mới nếu có đổi, ngược lại ngày sinh hiện tại
   */
  private nextBirthDate(
    horse: HorseEntity,
    changes: Partial<HorseEntity>,
  ): string | null {
    return changes.dateOfBirth === undefined
      ? horse.dateOfBirth
      : changes.dateOfBirth;
  }

  /**
   * Lấy cha/mẹ của ngựa sau khi sửa để kiểm lại
   *
   * - Có đổi thì lấy giá trị mới; giữ nguyên thì lấy giá trị hiện tại, bỏ qua cha/mẹ đã bị xóa hồ sơ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param changedId UUID cha/mẹ mới, undefined nếu không đổi, null nếu bỏ trống
   * @param currentId UUID cha/mẹ hiện tại của ngựa, null nếu bỏ trống
   * @returns Promise trả về UUID cha/mẹ cần kiểm, null nếu bỏ trống hoặc cha/mẹ giữ nguyên đã xóa hồ sơ
   */
  private async nextParentId(
    manager: EntityManager,
    changedId: string | null | undefined,
    currentId: string | null,
  ): Promise<string | null> {
    return changedId === undefined
      ? this.keptParentId(manager, currentId)
      : changedId;
  }

  /**
   * Lấy cha/mẹ đang giữ nguyên để kiểm lại, bỏ qua cha/mẹ đã bị xóa hồ sơ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param parentId UUID cha/mẹ hiện tại của ngựa, null nếu bỏ trống
   * @returns Promise trả về UUID cha/mẹ nếu hồ sơ còn, null nếu bỏ trống hoặc đã xóa
   */
  private async keptParentId(
    manager: EntityManager,
    parentId: string | null,
  ): Promise<string | null> {
    if (!parentId) return null;
    return (await this.access.findById(parentId, manager)) ? parentId : null;
  }

  /**
   * Tìm hồ sơ ngựa được chọn làm cha/mẹ (bỏ hồ sơ đã xóa)
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param id UUID của ngựa được chọn
   * @param label Nhãn Sire/Dam dùng trong thông báo lỗi
   * @returns Promise trả về hồ sơ cha/mẹ
   * @throws BadRequestException Nếu ngựa được chọn không tồn tại hoặc đã xóa
   */
  private async findParent(
    manager: EntityManager,
    id: string,
    label: string,
  ): Promise<HorseEntity> {
    const parent = await this.access.findById(id, manager);
    if (!parent) {
      throw new BadRequestException(`${label} không tồn tại`);
    }
    return parent;
  }
}

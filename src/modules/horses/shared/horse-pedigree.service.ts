import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HorseEntity } from '../entities/horse.entity';
import {
  assertBornBeforeChildren,
  assertGenderKeepsPedigree,
  assertParentIds,
  assertParentProfiles,
} from '../policies/horse.policy';
import type { ChildProfile, ParentUsage } from '../types/horse.types';
import { HorsePedigreeRepository } from './horse-pedigree.repository';
import { HorsesSharedRepository } from './horses-shared.repository';

/**
 * Luật phả hệ dùng chung cho tạo/sửa hồ sơ (horse-profiles) và xóa hồ sơ (horse-deletions).
 *
 * - Mọi hàm kiểm tra phải chạy trong transaction đã gọi lockPedigree
 */
@Injectable()
export class HorsePedigreeService {
  constructor(
    private readonly pedigree: HorsePedigreeRepository,
    private readonly horses: HorsesSharedRepository,
  ) {}

  /**
   * Giữ khóa phả hệ tới hết transaction, để các thao tác đổi phả hệ chạy lần lượt
   *
   * @param manager EntityManager của transaction đang chạy
   * @returns A promise resolving khi đã giữ được khóa
   */
  lockPedigree(manager: EntityManager): Promise<void> {
    return this.pedigree.lockPedigree(manager);
  }

  /**
   * Kiểm tra con ngựa đang là cha hoặc mẹ của ngựa khác, tính cả con đã xóa hồ sơ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param horseId UUID của ngựa
   * @returns A promise resolving to cờ đang là cha (asSire) và đang là mẹ (asDam)
   */
  parentUsage(manager: EntityManager, horseId: string): Promise<ParentUsage> {
    return this.pedigree.parentUsage(manager, horseId);
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
   * @returns A promise resolving khi kiểm tra xong
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
    const sire = sireId ? await this.findParent(manager, sireId, 'Sire') : null;
    const dam = damId ? await this.findParent(manager, damId, 'Dam') : null;
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
   * - Đổi cha/mẹ hoặc ngày sinh: cha/mẹ hợp lệ, không tạo vòng lặp phả hệ
   * - Đổi ngày sinh: vẫn sinh trước ngựa con sớm nhất, tính cả con đã xóa hồ sơ
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param horse Hồ sơ ngựa trước khi sửa
   * @param changes Các field thực sự đổi
   * @returns A promise resolving khi kiểm tra xong
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
        await this.pedigree.parentUsage(manager, horse.id),
        changes.gender,
      );
    }
    if ('sireId' in changes || 'damId' in changes || 'dateOfBirth' in changes) {
      await this.validateParents(
        manager,
        {
          id: horse.id,
          dateOfBirth:
            changes.dateOfBirth === undefined
              ? horse.dateOfBirth
              : changes.dateOfBirth,
        },
        changes.sireId === undefined ? horse.sireId : changes.sireId,
        changes.damId === undefined ? horse.damId : changes.damId,
      );
    }
    if (changes.dateOfBirth) {
      assertBornBeforeChildren(
        changes.dateOfBirth,
        await this.pedigree.earliestChildBirthDate(manager, horse.id),
      );
    }
  }

  /**
   * Tìm hồ sơ ngựa được chọn làm cha/mẹ (bỏ hồ sơ đã xóa)
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param id UUID của ngựa được chọn
   * @param label Nhãn Sire/Dam dùng trong thông báo lỗi
   * @returns A promise resolving to hồ sơ cha/mẹ
   * @throws BadRequestException Nếu ngựa được chọn không tồn tại hoặc đã xóa
   */
  private async findParent(
    manager: EntityManager,
    id: string,
    label: string,
  ): Promise<HorseEntity> {
    const parent = await this.horses.findById(id, manager);
    if (!parent) {
      throw new BadRequestException(`${label} không tồn tại`);
    }
    return parent;
  }
}

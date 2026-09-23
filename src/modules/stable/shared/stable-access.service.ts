import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { BarnEntity } from '../entities/barn.entity';
import {
  assertBarnActive,
  assertHorseHasBarn,
  assertHorseInTrainerBarn,
  assertHorseNotTransferred,
} from '../policies/stable.policy';
import type { StableHorseOperation } from '../types/stable.types';

/**
 * Con ngựa đã lock và chắc chắn đã được xếp khu
 */
export type HorseInBarn = HorseEntity & { barnId: string };

/**
 * Các kiểm tra quyền và lock dùng chung cho mọi feature của module stable (barns, stalls, groom-assignments).
 *
 * - Phạm vi Head Trainer theo khu lấy từ HorseAccessService (horses.barn_id)
 * - Luật "ngựa thao tác được": chưa xóa, chưa chuyển nhượng, đã có khu, Head Trainer phụ trách khu
 * - Lock khu chuồng (pessimistic_write) trước khi kiểm luật của khu
 */
@Injectable()
export class StableAccessService {
  constructor(private readonly horseAccess: HorseAccessService) {}

  /**
   * Lock con ngựa và kiểm tra Head Trainer được thao tác trên nó (xếp ô, giao hoặc đổi groom)
   *
   * - Lock row ngựa (pessimistic_write) trước khi kiểm, hồ sơ đã xóa coi như không có
   * - Thứ tự kiểm: có ngựa → đã xếp khu → người gọi phụ trách khu → chưa chuyển nhượng
   * - Chỉ tính Head Trainer phụ trách khu, kể cả khi người gọi có thêm vai trò khác
   * - Không kiểm trạng thái khu; nơi cần thì gọi thêm lockActiveBarn
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID của người gọi (users.id)
   * @param horseId UUID của ngựa
   * @param operation Thao tác đang làm, để chọn câu báo lỗi khi ngựa đã chuyển nhượng
   * @returns A promise resolving to con ngựa đã lock, chắc chắn đã có khu
   * @throws NotFoundException Nếu không có ngựa hoặc hồ sơ đã xóa
   * @throws ConflictException Nếu ngựa chưa được xếp khu hoặc đã chuyển nhượng
   * @throws ForbiddenException Nếu người gọi không phụ trách khu của ngựa
   */
  async lockOperableHorse(
    manager: EntityManager,
    callerId: string,
    horseId: string,
    operation: StableHorseOperation,
  ): Promise<HorseInBarn> {
    const horse = await manager.findOne(HorseEntity, {
      where: { id: horseId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    assertHorseHasBarn(horse);
    await this.assertHorseInTrainerBarn(manager, horseId, callerId);
    assertHorseNotTransferred(horse, operation);
    return horse as HorseInBarn;
  }

  /**
   * Chặn Head Trainer thao tác trên ngựa ngoài khu mình phụ trách, kể cả khi người gọi có thêm vai trò Club Manager
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param horseId UUID của ngựa
   * @param callerId UUID của người gọi (users.id)
   * @returns A promise resolving khi kiểm tra xong
   * @throws ForbiddenException Nếu ngựa không thuộc khu người gọi phụ trách
   */
  async assertHorseInTrainerBarn(
    manager: EntityManager,
    horseId: string,
    callerId: string,
  ): Promise<void> {
    assertHorseInTrainerBarn(
      await this.horseAccess.isHorseInTrainerBarn(manager, horseId, callerId),
    );
  }

  /**
   * Lock một khu chuồng (pessimistic_write) để các thao tác đổi khu, thêm ô, xếp ngựa vào khu chạy lần lượt
   *
   * @param manager EntityManager của transaction đang chạy
   * @param barnId UUID của khu chuồng
   * @param notFoundMessage Câu báo 404 khi không có khu
   * @returns A promise resolving to khu chuồng đã lock
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   */
  async lockBarn(
    manager: EntityManager,
    barnId: string,
    notFoundMessage = 'Không tìm thấy khu chuồng',
  ): Promise<BarnEntity> {
    const barn = await manager.findOne(BarnEntity, {
      where: { id: barnId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!barn) throw new NotFoundException(notFoundMessage);
    return barn;
  }

  /**
   * Lock khu chuồng và chặn thao tác khi khu không ở trạng thái ACTIVE
   *
   * @param manager EntityManager của transaction đang chạy
   * @param barnId UUID của khu chuồng
   * @param label Cách gọi khu trong câu báo lỗi (vd "Khu chuồng", "Khu chuồng đích")
   * @returns A promise resolving to khu chuồng đã lock, chắc chắn đang ACTIVE
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws BadRequestException Nếu khu không ở trạng thái ACTIVE
   */
  async lockActiveBarn(
    manager: EntityManager,
    barnId: string,
    label = 'Khu chuồng',
  ): Promise<BarnEntity> {
    const barn = await this.lockBarn(
      manager,
      barnId,
      `Không tìm thấy ${label.toLowerCase()}`,
    );
    assertBarnActive(barn, label);
    return barn;
  }
}

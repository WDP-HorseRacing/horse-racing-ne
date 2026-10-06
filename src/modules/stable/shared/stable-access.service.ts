import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { READ_ONLY_LIFECYCLE_STATUSES } from '../../horses/constants/horse.constants';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { BarnEntity } from '../entities/barn.entity';
import { StallEntity } from '../entities/stall.entity';
import { StallStatus } from '../constants/stall-status.enum';
import {
  assertBarnActive,
  assertHorseHasBarn,
  assertHorseInTrainerBarn,
  assertHorseLifecycleWritable,
  EMPTY_CAPACITY,
} from '../policies/stable.policy';
import type {
  BarnStallCapacity,
  StableHorseOperation,
} from '../types/stable.types';

/**
 * Đếm ô trống và ngựa chờ xếp ô của nhiều khu trong một câu query.
 *
 * - Ô trống: ô thuộc khu, chưa xóa, đang AVAILABLE và không có phân công đang mở
 * - Ngựa chờ xếp ô: horses.barn_id = khu, chưa xóa, không TRANSFERRED hay DECEASED và không có phân công ô đang mở
 */
const BARN_STALL_CAPACITY_SQL = `SELECT b.id AS "barnId",
       (SELECT COUNT(*)::int
          FROM stalls s
         WHERE s.barn_id = b.id
           AND s.deleted_at IS NULL
           AND s.status = $2
           AND NOT EXISTS (
                 SELECT 1
                   FROM stall_assignments sa
                  WHERE sa.stall_id = s.id
                    AND sa.end_at IS NULL
               )) AS "freeStallCount",
       (SELECT COUNT(*)::int
          FROM horses h
         WHERE h.barn_id = b.id
           AND h.deleted_at IS NULL
           AND h.lifecycle_status <> ALL($3::varchar[])
           AND NOT EXISTS (
                 SELECT 1
                   FROM stall_assignments sa
                  WHERE sa.horse_id = h.id
                    AND sa.end_at IS NULL
               )) AS "pendingStallHorseCount"
  FROM barns b
 WHERE b.id = ANY($1::uuid[])`;

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
 * - Đếm ô chuồng và sức chứa của một khu
 */
@Injectable()
export class StableAccessService {
  constructor(private readonly horseAccess: HorseAccessService) {}

  /**
   * Lock con ngựa và kiểm tra Head Trainer được thao tác trên nó (xếp ô, giao hoặc đổi groom)
   *
   * - Lock row ngựa (pessimistic_write) trước khi kiểm, hồ sơ đã xóa coi như không có
   * - Thứ tự kiểm: có ngựa → chưa chuyển nhượng → đã xếp khu → người gọi phụ trách khu
   * - Chỉ tính Head Trainer phụ trách khu, kể cả khi người gọi có thêm vai trò khác
   * - Không kiểm trạng thái khu; nơi cần thì gọi thêm lockActiveBarn
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID của người gọi (users.id)
   * @param horseId UUID của ngựa
   * @param operation Thao tác đang làm, để chọn câu báo lỗi khi ngựa đã chuyển nhượng hoặc đã mất
   * @returns Promise trả về con ngựa đã lock, chắc chắn đã có khu
   * @throws NotFoundException Nếu không có ngựa hoặc hồ sơ đã xóa
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng hoặc đã mất
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
    assertHorseLifecycleWritable(horse, operation);
    assertHorseHasBarn(horse);
    await this.assertHorseInTrainerBarn(manager, horseId, callerId);
    return horse;
  }

  /**
   * Chặn Head Trainer thao tác trên ngựa ngoài khu mình phụ trách, kể cả khi người gọi có thêm vai trò Club Manager
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param horseId UUID của ngựa
   * @param callerId UUID của người gọi (users.id)
   * @returns Promise hoàn tất khi kiểm tra xong
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
   * Lock một khu chuồng (pessimistic_write), dùng khi đổi khu, thêm ô hoặc xếp ngựa vào khu
   *
   * @param manager EntityManager của transaction đang chạy
   * @param barnId UUID của khu chuồng
   * @param notFoundMessage Câu báo 404 khi không có khu
   * @returns Promise trả về khu chuồng đã lock
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
   * @returns Promise trả về khu chuồng đã lock, chắc chắn đang ACTIVE
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws ConflictException Nếu khu không ở trạng thái ACTIVE
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

  /**
   * Đếm số ô trống và số ngựa chờ xếp ô của từng khu chuồng
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param barnIds UUID các khu cần đếm
   * @returns Promise trả về Map từ UUID khu sang số ô trống và số ngựa chờ xếp ô; khu không tồn tại thì không có trong Map
   */
  async countStallCapacity(
    manager: EntityManager,
    barnIds: string[],
  ): Promise<Map<string, BarnStallCapacity>> {
    if (barnIds.length === 0) return new Map();
    const rows: ({ barnId: string } & BarnStallCapacity)[] =
      await manager.query(BARN_STALL_CAPACITY_SQL, [
        barnIds,
        StallStatus.AVAILABLE,
        READ_ONLY_LIFECYCLE_STATUSES,
      ]);
    return new Map(
      rows.map((row) => [
        row.barnId,
        {
          freeStallCount: row.freeStallCount,
          pendingStallHorseCount: row.pendingStallHorseCount,
        },
      ]),
    );
  }

  /**
   * Đếm số ô trống và số ngựa chờ xếp ô của một khu chuồng
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param barnId UUID của khu chuồng
   * @returns Promise trả về số ô trống và số ngựa chờ xếp ô của khu; khu không tồn tại thì trả EMPTY_CAPACITY
   */
  async countBarnCapacity(
    manager: EntityManager,
    barnId: string,
  ): Promise<BarnStallCapacity> {
    return (
      (await this.countStallCapacity(manager, [barnId])).get(barnId) ??
      EMPTY_CAPACITY
    );
  }

  /**
   * Đếm số ô chuồng chưa xóa của một khu, dùng để so với sức chứa khu
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param barnId UUID của khu chuồng
   * @returns Promise trả về số ô chuồng chưa xóa của khu
   */
  countStallsInBarn(manager: EntityManager, barnId: string): Promise<number> {
    return manager.count(StallEntity, { where: { barnId } });
  }
}

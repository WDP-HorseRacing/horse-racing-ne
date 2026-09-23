import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { StallStatus } from '../constants/stall-status.enum';
import { StallEntity } from '../entities/stall.entity';
import type { BarnStallCapacity } from '../types/stable.types';

/**
 * Đếm ô trống và ngựa chờ xếp ô của nhiều khu trong một câu query.
 *
 * - Ô trống: ô thuộc khu, chưa xóa, đang AVAILABLE và không có phân công đang mở
 * - Ngựa chờ xếp ô: horses.barn_id = khu, chưa xóa, khác TRANSFERRED và không có phân công ô đang mở
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
           AND h.lifecycle_status <> $3
           AND NOT EXISTS (
                 SELECT 1
                   FROM stall_assignments sa
                  WHERE sa.horse_id = h.id
                    AND sa.end_at IS NULL
               )) AS "pendingStallHorseCount"
  FROM barns b
 WHERE b.id = ANY($1::uuid[])`;

/**
 * Các query về sức chứa khu chuồng mà nhiều feature của module stable cùng dùng (barns, stalls).
 *
 * - Không đăng ký entity bằng forFeature: luôn chạy trên manager nơi gọi truyền vào, để đi chung transaction và lock
 */
@Injectable()
export class StableSharedRepository {
  /**
   * Đếm số ô trống và số ngựa chờ xếp ô của từng khu chuồng
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param barnIds UUID các khu cần đếm
   * @returns A promise resolving to Map từ UUID khu sang số ô trống và số ngựa chờ xếp ô; khu không tồn tại thì không có trong Map
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
        HorseLifecycleStatus.TRANSFERRED,
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
   * Đếm số ô chuồng chưa xóa của một khu, dùng để so với sức chứa khu
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param barnId UUID của khu chuồng
   * @returns A promise resolving to số ô chuồng chưa xóa của khu
   */
  countStallsInBarn(manager: EntityManager, barnId: string): Promise<number> {
    return manager.count(StallEntity, { where: { barnId } });
  }
}

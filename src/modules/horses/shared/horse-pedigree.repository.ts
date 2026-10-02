import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PEDIGREE_LOCK_KEY } from '../constants/horse.constants';

/**
 * Các query phả hệ phức tạp (advisory lock, CTE đệ quy) chạy trong transaction đang giữ khóa phả hệ. Dùng chung cho tạo/sửa hồ sơ (horse-profiles) và xóa hồ sơ (horse-deletions).
 */
@Injectable()
export class HorsePedigreeRepository {
  /**
   * Giữ khóa phả hệ tới hết transaction (Postgres advisory lock)
   *
   * - Mọi thao tác đổi quan hệ cha/mẹ, giới tính, ngày sinh hoặc xóa ngựa phải gọi hàm này trước khi kiểm tra
   * - Các thao tác giữ khóa này chạy lần lượt
   * - Khóa tự nhả khi transaction commit hoặc rollback
   *
   * @param manager EntityManager của transaction đang chạy
   * @returns Promise hoàn tất khi đã giữ được khóa
   */
  async lockPedigree(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      PEDIGREE_LOCK_KEY,
    ]);
  }

  /**
   * Kiểm tra gán một ngựa làm cha/mẹ có tạo vòng lặp phả hệ không
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param childHorseId UUID của ngựa con
   * @param parentHorseId UUID của ngựa định làm cha/mẹ
   * @returns Promise trả về true nếu ngựa con đã là tổ tiên của ngựa định làm cha/mẹ
   */
  async wouldCreateCycle(
    manager: EntityManager,
    childHorseId: string,
    parentHorseId: string,
  ): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await manager.query(
      `
        WITH RECURSIVE ancestors(horse_id, path) AS (
          SELECT $1::uuid, ARRAY[$1::uuid]
          UNION ALL
          SELECT parent_id, ancestors.path || parent_id
          FROM horses child
          JOIN ancestors ON ancestors.horse_id = child.id
          CROSS JOIN LATERAL unnest(ARRAY[child.sire_id, child.dam_id]) AS parent_id
          WHERE parent_id IS NOT NULL
            AND NOT parent_id = ANY(ancestors.path)
        )
        SELECT EXISTS (
          SELECT 1 FROM ancestors WHERE horse_id = $2::uuid
        ) AS exists
      `,
      [parentHorseId, childHorseId],
    );
    return rows[0]?.exists === true;
  }
}

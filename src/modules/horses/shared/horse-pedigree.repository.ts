import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull, Not } from 'typeorm';
import { PEDIGREE_LOCK_KEY } from '../constants/horse.constants';
import { HorseEntity } from '../entities/horse.entity';
import type { ParentUsage } from '../types/horse.types';

/**
 * Các query phả hệ chạy trong transaction đang giữ khóa phả hệ. Dùng chung cho tạo/sửa hồ sơ (horse-profiles) và xóa hồ sơ (horse-deletions).
 */
@Injectable()
export class HorsePedigreeRepository {
  /**
   * Giữ khóa phả hệ tới hết transaction (Postgres advisory lock)
   *
   * - Mọi thao tác đổi quan hệ cha/mẹ, giới tính, ngày sinh hoặc xóa ngựa phải gọi hàm này trước khi kiểm tra
   * - Các thao tác đó chạy lần lượt nên luôn kiểm tra trên dữ liệu đã commit, kể cả vòng lặp phả hệ qua nhiều đời
   * - Khóa tự nhả khi transaction commit hoặc rollback
   *
   * @param manager EntityManager của transaction đang chạy
   * @returns A promise resolving khi đã giữ được khóa
   */
  async lockPedigree(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      PEDIGREE_LOCK_KEY,
    ]);
  }

  /**
   * Kiểm tra con ngựa đang được tham chiếu làm cha hoặc mẹ của ngựa khác, tính cả ngựa con đã xóa hồ sơ (khôi phục con sau này sẽ trỏ lại vào cha/mẹ này)
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param horseId UUID của ngựa
   * @returns A promise resolving to cờ đang là cha (asSire) và đang là mẹ (asDam)
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
   * Lấy ngày sinh sớm nhất trong các ngựa con của một con ngựa, tính cả con đã xóa hồ sơ
   *
   * - Con đã xóa vẫn tính vì khôi phục con sau này sẽ trỏ lại cha/mẹ này; bỏ qua con thì cha/mẹ đổi được ngày sinh sau con, khôi phục con xong phả hệ sai
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param horseId UUID của ngựa cha/mẹ
   * @returns A promise resolving to ngày sinh sớm nhất (YYYY-MM-DD), null nếu không có con nào có ngày sinh
   */
  async earliestChildBirthDate(
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
   * Kiểm tra gán một ngựa làm cha/mẹ có tạo vòng lặp phả hệ không
   *
   * @param manager EntityManager của transaction đang giữ khóa phả hệ
   * @param childHorseId UUID của ngựa con
   * @param parentHorseId UUID của ngựa định làm cha/mẹ
   * @returns A promise resolving to true nếu ngựa con đã là tổ tiên của ngựa định làm cha/mẹ
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

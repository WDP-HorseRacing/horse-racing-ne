import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';

import { HorseListSortBy } from '../enums/horse-list-sort.enum';
import { HorseHealthStatus } from '../enums/horse-status.enum';
import { HorseListQueryDto } from '../dto/horse.dto';
import { HorseEntity } from '../entities/horse.entity';
import { applyHorseScope } from '../utils/horse-scope';
import type {
  HorseCurrentStallRow,
  HorseScope,
  PedigreeAncestorRow,
} from '../types/horse.types';
import {
  HORSE_BUSINESS_TABLES,
  PEDIGREE_LOCK_KEY,
  VIETNAMESE_NAME_ORDER,
} from '../enums/horse.constants';

@Injectable()
export class HorseProfilesRepository {
  constructor(
    @InjectRepository(HorseEntity)
    private readonly horses: Repository<HorseEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Giữ khoá phả hệ tới hết transaction (Postgres advisory lock).
   *
   * - Mọi thao tác đổi quan hệ cha/mẹ, giới tính hoặc ngày sinh liên quan phả hệ phải gọi hàm này trước khi kiểm tra
   * - Các thao tác đó chạy lần lượt nên luôn kiểm tra trên dữ liệu đã commit, kể cả vòng lặp phả hệ qua nhiều đời
   * - Khoá tự nhả khi transaction commit hoặc rollback
   *
   * @param manager EntityManager của transaction đang chạy
   * @returns Promise hoàn tất khi đã giữ được khoá
   */
  async lockPedigree(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      PEDIGREE_LOCK_KEY,
    ]);
  }

  /**
   * List horses, limited to the caller's visibility scope
   * @param scope The visibility scope of the caller
   * @param query The filter, search and pagination parameters
   * @returns A promise resolving to an array of horses and the total count
   */
  list(
    scope: HorseScope,
    query: HorseListQueryDto,
  ): Promise<[HorseEntity[], number]> {
    const qb = this.horses
      .createQueryBuilder('horse')
      .where('horse.isReference = :reference', {
        reference: query.reference,
      });
    applyHorseScope(qb, scope);

    if (query.search) {
      qb.andWhere(
        '(unaccent(horse.name) ILIKE unaccent(:search) OR horse.microchipId ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.healthStatus) {
      qb.andWhere('horse.healthStatus = :healthStatus', {
        healthStatus: query.healthStatus,
      });
    }
    if (query.lifecycleStatus) {
      qb.andWhere('horse.lifecycleStatus = :lifecycleStatus', {
        lifecycleStatus: query.lifecycleStatus,
      });
    }
    if (query.gender) {
      qb.andWhere('horse.gender = :gender', { gender: query.gender });
    }
    if (query.raceAptitude) {
      qb.andWhere('horse.raceAptitude = :raceAptitude', {
        raceAptitude: query.raceAptitude,
      });
    }
    if (query.barnId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM stall_assignments sa JOIN stalls s ON s.id = sa.stall_id AND s.deleted_at IS NULL WHERE sa.horse_id = horse.id AND sa.end_at IS NULL AND s.barn_id = :barnId)',
        { barnId: query.barnId },
      );
    }
    if (query.deleted) {
      qb.withDeleted().andWhere('horse.deletedAt IS NOT NULL');
    }
    if (query.sortBy === HorseListSortBy.HEALTH_PRIORITY) {
      qb.addSelect(
        `CASE horse.health_status WHEN '${HorseHealthStatus.INJURED}' THEN 0 WHEN '${HorseHealthStatus.QUARANTINED}' THEN 0 WHEN '${HorseHealthStatus.UNDER_OBSERVATION}' THEN 1 ELSE 2 END`,
        'health_priority',
      )
        .orderBy('health_priority', query.sortOrder)
        .addOrderBy(VIETNAMESE_NAME_ORDER, 'ASC');
    } else {
      qb.orderBy(VIETNAMESE_NAME_ORDER, query.sortOrder);
    }

    return qb.skip(query.skip).take(query.limit).getManyAndCount();
  }

  /**
   * Kiểm tra ngựa đã từng phát sinh dữ liệu nghiệp vụ chưa, để quyết định có được xóa hồ sơ không.
   *
   * - Tính cả dòng đã đóng, đã hủy hoặc đã xóa mềm, vì đều là lịch sử
   * - Gồm: khám bệnh, lịch chăm sóc, khóa huấn luyện, giáo án, đăng ký thi đấu, sở hữu, xếp chuồng, phân công groom, khẩu phần, checklist, sự cố, chỉ số đo, ngưỡng hiệu suất
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager của transaction đang chạy
   * @returns Promise trả về true nếu có ít nhất một dòng dữ liệu nghiệp vụ
   */
  async hasBusinessData(
    horseId: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const checks = HORSE_BUSINESS_TABLES.map(
      (table) => `EXISTS (SELECT 1 FROM ${table} WHERE horse_id = $1)`,
    ).join(' OR ');
    const rows: Array<{ exists: boolean }> = await manager.query(
      `SELECT (${checks}) AS exists`,
      [horseId],
    );
    return rows[0]?.exists === true;
  }

  /**
   * Find the current stall and barn of each horse that has an open stall assignment
   * @param horseIds The IDs of the horses
   * @returns A promise resolving to one row per horse with an open assignment in a live stall and barn
   */
  async currentStallsByHorseIds(
    horseIds: string[],
  ): Promise<HorseCurrentStallRow[]> {
    if (horseIds.length === 0) return [];
    const rows: HorseCurrentStallRow[] = await this.dataSource.query(
      `SELECT sa.horse_id AS "horseId",
              s.id AS "stallId",
              s.code AS "stallCode",
              b.id AS "barnId",
              b.name AS "barnName"
         FROM stall_assignments sa
         JOIN stalls s ON s.id = sa.stall_id AND s.deleted_at IS NULL
         JOIN barns b ON b.id = s.barn_id AND b.deleted_at IS NULL
        WHERE sa.horse_id = ANY($1)
          AND sa.end_at IS NULL`,
      [horseIds],
    );
    return rows;
  }

  /**
   * Find which of the given horses have an active training lock
   * @param horseIds The IDs of the horses
   * @returns A promise resolving to the set of horse IDs with an active lock
   */
  async activeTrainingLockHorseIds(horseIds: string[]): Promise<Set<string>> {
    if (horseIds.length === 0) return new Set();
    const rows: Array<{ horse_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT horse_id FROM training_locks WHERE horse_id = ANY($1) AND status = $2`,
      [horseIds, TrainingLockStatus.ACTIVE],
    );
    return new Set(rows.map((row) => row.horse_id));
  }

  /**
   * Check whether assigning a parent would create a cycle in the pedigree
   * @param childHorseId The ID of the child horse
   * @param parentHorseId The ID of the candidate parent horse
   * @param manager The transaction entity manager, omitted outside a transaction
   * @returns A promise resolving to true if the child is already an ancestor of the parent
   */
  async wouldCreateCycle(
    childHorseId: string,
    parentHorseId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await (
      manager ?? this.dataSource
    ).query(
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

  /**
   * Find the ancestors of a horse up to the given number of generations
   * @param horseId The ID of the horse
   * @param depth The maximum number of generations to traverse
   * @returns A promise resolving to the ancestor rows ordered by generation
   */
  findPedigreeAncestors(
    horseId: string,
    depth: number,
  ): Promise<PedigreeAncestorRow[]> {
    return this.dataSource.query(
      `
        WITH RECURSIVE pedigree AS (
          SELECT parent.id,
                 child.id AS child_id,
                 CASE WHEN child.sire_id = parent.id THEN 'SIRE' ELSE 'DAM' END AS parent_role,
                 1 AS generation,
                 ARRAY[child.id, parent.id] AS path
          FROM horses child
          JOIN horses parent ON parent.id IN (child.sire_id, child.dam_id)
          WHERE child.id = $1::uuid
            AND child.deleted_at IS NULL
            AND parent.deleted_at IS NULL

          UNION ALL

          SELECT parent.id,
                 child.id,
                 CASE WHEN child.sire_id = parent.id THEN 'SIRE' ELSE 'DAM' END,
                 pedigree.generation + 1,
                 pedigree.path || parent.id
          FROM pedigree
          JOIN horses child ON child.id = pedigree.id
          JOIN horses parent ON parent.id IN (child.sire_id, child.dam_id)
          WHERE pedigree.generation < $2::integer
            AND parent.deleted_at IS NULL
            AND NOT parent.id = ANY(pedigree.path)
        )
        SELECT ancestor.id,
               ancestor.name,
               ancestor.gender,
               ancestor.breed,
               ancestor.color,
               to_char(ancestor.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
               ancestor.race_aptitude AS "raceAptitude",
               ancestor.is_reference AS "isReference",
               pedigree.generation,
               pedigree.parent_role AS "parentRole",
               pedigree.child_id AS "childId"
        FROM pedigree
        JOIN horses ancestor ON ancestor.id = pedigree.id
        ORDER BY pedigree.generation, pedigree.parent_role DESC, ancestor.name
      `,
      [horseId, depth],
    );
  }
}

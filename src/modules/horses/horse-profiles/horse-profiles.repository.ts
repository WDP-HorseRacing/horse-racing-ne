import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { BarnStatus } from '../../stable/constants/barn-status.enum';
import { StallStatus } from '../../stable/constants/stall-status.enum';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { StallAssignmentEntity } from '../../stable/entities/stall-assignment.entity';
import { StallEntity } from '../../stable/entities/stall.entity';
import {
  HORSE_BUSINESS_TABLES,
  PEDIGREE_LOCK_KEY,
  VIETNAMESE_NAME_ORDER,
} from '../enums/horse.constants';
import { HorseListSortBy } from '../enums/horse-list-sort.enum';
import { HorseHealthStatus } from '../enums/horse-status.enum';
import { HorseListQueryDto } from '../dto/horse.dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseEntity } from '../entities/horse.entity';
import { applyHorseScope } from '../utils/horse-scope';
import type {
  HorseCurrentStallRow,
  HorsePersonRow,
  HorseScope,
  PedigreeAncestorRow,
} from '../types/horse.types';

@Injectable()
export class HorseProfilesRepository {
  constructor(
    @InjectRepository(HorseEntity)
    private readonly horses: Repository<HorseEntity>,
    @InjectRepository(HorseOwnershipEntity)
    private readonly ownerships: Repository<HorseOwnershipEntity>,
    @InjectRepository(HorseMeasurementEntity)
    private readonly measurements: Repository<HorseMeasurementEntity>,
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
   * Chọn repository ngựa theo transaction: có manager thì dùng của transaction, không thì dùng repository inject sẵn.
   *
   * @param manager EntityManager của transaction, bỏ trống khi chạy ngoài transaction
   * @returns Repository của HorseEntity
   */
  private horseRepository(manager?: EntityManager): Repository<HorseEntity> {
    return manager ? manager.getRepository(HorseEntity) : this.horses;
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
   * Check whether a microchip ID is used by any horse, including soft-deleted and transferred horses
   * @param microchipId The microchip ID to check
   * @param excludeHorseId The ID of a horse to ignore, used when updating that horse
   * @returns A promise resolving to true if another horse already uses the microchip ID
   */
  microchipTaken(
    microchipId: string,
    excludeHorseId?: string,
  ): Promise<boolean> {
    return this.horses.exists({
      where: excludeHorseId
        ? { microchipId, id: Not(excludeHorseId) }
        : { microchipId },
      withDeleted: true,
    });
  }

  /**
   * Find a live stall and lock its row until the transaction ends
   * @param manager The transaction entity manager
   * @param stallId The ID of the stall
   * @returns A promise resolving to the locked stall, or null if not found
   */
  lockStall(
    manager: EntityManager,
    stallId: string,
  ): Promise<StallEntity | null> {
    return manager.getRepository(StallEntity).findOne({
      where: { id: stallId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Check whether a barn is live and ACTIVE within a transaction
   * @param manager The transaction entity manager
   * @param barnId The ID of the barn
   * @returns A promise resolving to true if the barn exists, is not deleted and is ACTIVE
   */
  barnIsActive(manager: EntityManager, barnId: string): Promise<boolean> {
    return manager
      .getRepository(BarnEntity)
      .existsBy({ id: barnId, status: BarnStatus.ACTIVE });
  }

  /**
   * Check whether a stall has an open assignment within a transaction
   * @param manager The transaction entity manager
   * @param stallId The ID of the stall
   * @returns A promise resolving to true if a horse is currently in the stall
   */
  stallHasActiveAssignment(
    manager: EntityManager,
    stallId: string,
  ): Promise<boolean> {
    return manager
      .getRepository(StallAssignmentEntity)
      .existsBy({ stallId, endAt: IsNull() });
  }

  /**
   * Open a stall assignment for a horse and mark the stall as occupied within a transaction
   * @param manager The transaction entity manager
   * @param stall The locked stall
   * @param horseId The ID of the horse
   * @param startAt The start time of the assignment
   * @returns A promise that resolves once the assignment is saved
   */
  async assignStall(
    manager: EntityManager,
    stall: StallEntity,
    horseId: string,
    startAt: Date,
  ): Promise<void> {
    await manager.save(StallAssignmentEntity, {
      stallId: stall.id,
      horseId,
      startAt,
      endAt: null,
    });
    await manager
      .getRepository(StallEntity)
      .update({ id: stall.id }, { status: StallStatus.OCCUPIED });
  }

  /**
   * Check whether a horse is referenced as a sire or dam by other horses
   * @param horseId The ID of the horse
   * @param manager The transaction entity manager, omitted outside a transaction
   * @returns A promise resolving to the sire and dam usage flags
   */
  async parentUsage(
    horseId: string,
    manager?: EntityManager,
  ): Promise<{ asSire: boolean; asDam: boolean }> {
    const horses = this.horseRepository(manager);
    const [asSire, asDam] = await Promise.all([
      horses.existsBy({ sireId: horseId }),
      horses.existsBy({ damId: horseId }),
    ]);
    return { asSire, asDam };
  }

  /**
   * Lấy ngày sinh sớm nhất trong các ngựa con của một con ngựa (ngựa đó là sire hoặc dam).
   *
   * - Bỏ qua ngựa con chưa có ngày sinh và ngựa con đã xóa
   * - Dùng findOne qua entity để cột date trả về chuỗi YYYY-MM-DD, không bị driver đổi thành Date
   *
   * @param horseId UUID của ngựa cha/mẹ
   * @param manager EntityManager của transaction, bỏ trống khi chạy ngoài transaction
   * @returns Promise trả về ngày sinh (YYYY-MM-DD) của con sinh sớm nhất, null nếu không có
   */
  async earliestChildBirthDate(
    horseId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const child = await this.horseRepository(manager).findOne({
      select: { id: true, dateOfBirth: true },
      where: [
        { sireId: horseId, dateOfBirth: Not(IsNull()) },
        { damId: horseId, dateOfBirth: Not(IsNull()) },
      ],
      order: { dateOfBirth: 'ASC' },
    });
    return child?.dateOfBirth ?? null;
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
   * Lấy groom đang phụ trách con ngựa.
   *
   * @param horseId UUID của ngựa
   * @returns Groom (id, họ tên), hoặc null nếu ngựa chưa được giao groom
   */
  async currentGroom(horseId: string): Promise<HorsePersonRow | null> {
    const assignment = await this.dataSource
      .getRepository(GroomAssignmentEntity)
      .findOne({
        where: { horseId, endAt: IsNull() },
        relations: { groom: true },
      });
    return assignment
      ? { id: assignment.groom.id, fullName: assignment.groom.fullName }
      : null;
  }

  /**
   * Lấy chủ đại diện trong số các chủ đang sở hữu con ngựa.
   *
   * @param horseId UUID của ngựa
   * @returns Chủ đại diện (id, họ tên), hoặc null nếu ngựa chưa có chủ đại diện
   */
  async representativeOwner(horseId: string): Promise<HorsePersonRow | null> {
    const ownership = await this.ownerships.findOne({
      where: { horseId, endAt: IsNull(), isRepresentative: true },
      relations: { owner: true },
    });
    return ownership
      ? { id: ownership.owner.id, fullName: ownership.owner.fullName }
      : null;
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
   * Get the most recent measurement of each type for a horse
   * @param horseId The ID of the horse
   * @returns A promise resolving to one latest measurement per type
   */
  latestMeasurements(horseId: string): Promise<HorseMeasurementEntity[]> {
    return this.measurements
      .createQueryBuilder('m')
      .distinctOn(['m.type'])
      .where('m.horseId = :horseId', { horseId })
      .orderBy('m.type', 'ASC')
      .addOrderBy('m.measuredAt', 'DESC')
      .getMany();
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

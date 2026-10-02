import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { HorseListSortBy } from '../enums/horse-list-sort.enum';
import { HorsePlacementStatus } from '../enums/horse-placement-status.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { HorseListQueryDto } from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import { applyHorseScope } from '../utils/horse-scope';
import type {
  HorseLocationRow,
  HorseScope,
  PedigreeAncestorRow,
} from '../types/horse.types';
import { VIETNAMESE_NAME_ORDER } from '../constants/horse.constants';

@Injectable()
export class HorseProfilesRepository {
  constructor(
    @InjectRepository(HorseEntity)
    private readonly horses: Repository<HorseEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy một trang danh sách ngựa trong phạm vi người gọi, theo từ khóa và bộ lọc.
   *
   * - Mặc định bỏ hồ sơ đã xóa; includeDeleted gộp thêm hồ sơ đã xóa (quyền do service kiểm)
   * - myBarns: ngựa thuộc khu người gọi làm Head Trainer; myHorses: ngựa người gọi đang là Groom phụ trách
   * - placementStatus tính từ vòng đời, horses.barn_id và dòng xếp ô đang mở
   * - Sắp xếp mặc định: chấn thương/cách ly, rồi cần theo dõi, rồi còn lại; cùng nhóm theo tên tiếng Việt
   *
   * @param scope Phạm vi xem của người gọi
   * @param callerId UUID của người gọi, dùng cho myBarns và myHorses
   * @param query Từ khóa, bộ lọc, sắp xếp và phân trang
   * @returns Promise trả về các ngựa của trang hiện tại và tổng số dòng khớp
   */
  list(
    scope: HorseScope,
    callerId: string,
    query: HorseListQueryDto,
  ): Promise<[HorseEntity[], number]> {
    const qb = this.horses.createQueryBuilder('horse');
    applyHorseScope(qb, scope);
    this.applyListFilters(qb, callerId, query);
    this.applyListSort(qb, query);

    return qb.skip(query.skip).take(query.limit).getManyAndCount();
  }

  /**
   * Thêm các điều kiện lọc của danh sách ngựa vào query builder
   *
   * - myBarns: ngựa thuộc khu người gọi làm Head Trainer; myHorses: ngựa người gọi đang là Groom phụ trách
   * - includeDeleted gộp thêm hồ sơ đã xóa
   *
   * @param qb Query builder của bảng ngựa với alias `horse`
   * @param callerId UUID của người gọi, dùng cho myBarns và myHorses
   * @param query Từ khóa và bộ lọc
   */
  private applyListFilters(
    qb: SelectQueryBuilder<HorseEntity>,
    callerId: string,
    query: HorseListQueryDto,
  ): void {
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
      qb.andWhere('horse.barnId = :barnId', { barnId: query.barnId });
    }
    if (query.myBarns) {
      qb.andWhere(
        'horse.barn_id IN (SELECT b.id FROM barns b WHERE b.head_trainer_id = :callerId AND b.deleted_at IS NULL)',
        { callerId },
      );
    }
    if (query.myHorses) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM groom_assignments ga WHERE ga.horse_id = horse.id AND ga.groom_id = :callerId AND ga.end_at IS NULL)',
        { callerId },
      );
    }
    if (query.placementStatus) {
      qb.andWhere(`(${PLACEMENT_STATUS_SQL}) = :placementStatus`, {
        placementStatus: query.placementStatus,
      });
    }
    if (query.includeDeleted) {
      qb.withDeleted();
    }
  }

  /**
   * Thêm thứ tự sắp xếp của danh sách ngựa vào query builder
   *
   * - HEALTH_PRIORITY: chấn thương/cách ly, rồi cần theo dõi, rồi còn lại; cùng nhóm theo tên tiếng Việt tăng dần
   * - Mặc định: theo tên tiếng Việt
   *
   * @param qb Query builder của bảng ngựa với alias `horse`
   * @param query Cách sắp xếp và chiều sắp xếp
   */
  private applyListSort(
    qb: SelectQueryBuilder<HorseEntity>,
    query: HorseListQueryDto,
  ): void {
    if (query.sortBy === HorseListSortBy.HEALTH_PRIORITY) {
      qb.addSelect(HEALTH_PRIORITY_SQL, 'health_priority')
        .orderBy('health_priority', query.sortOrder)
        .addOrderBy(VIETNAMESE_NAME_ORDER, 'ASC');
    } else {
      qb.orderBy(VIETNAMESE_NAME_ORDER, query.sortOrder);
    }
  }

  /**
   * Lấy khu (theo horses.barn_id) và ô đang mở của từng con ngựa, kể cả hồ sơ đã xóa.
   *
   * - Khu hoặc ô đã bị xóa mềm thì coi như không có
   * - Ngựa nào cũng có đúng một dòng, thiếu khu hoặc ô thì cột tương ứng là null
   *
   * @param horseIds UUID các con ngựa
   * @returns Promise trả về vị trí của từng con ngựa
   */
  async locationsByHorseIds(horseIds: string[]): Promise<HorseLocationRow[]> {
    if (horseIds.length === 0) return [];
    const rows: HorseLocationRow[] = await this.dataSource.query(
      `SELECT h.id AS "horseId",
              b.id AS "barnId",
              b.name AS "barnName",
              s.id AS "stallId",
              s.code AS "stallCode"
         FROM horses h
         LEFT JOIN barns b ON b.id = h.barn_id AND b.deleted_at IS NULL
         LEFT JOIN stall_assignments sa ON sa.horse_id = h.id AND sa.end_at IS NULL
         LEFT JOIN stalls s ON s.id = sa.stall_id AND s.deleted_at IS NULL
        WHERE h.id = ANY($1)`,
      [horseIds],
    );
    return rows;
  }

  /**
   * Lấy tổ tiên của ngựa tới số đời cho trước, bỏ tổ tiên đã xóa hồ sơ
   *
   * @param horseId UUID của ngựa
   * @param depth Số đời tối đa cần lấy
   * @returns Promise trả về các dòng tổ tiên, xếp theo đời
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
               ancestor.owner_id AS "ownerId",
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

/**
 * Biểu thức SQL tính HorsePlacementStatus của một dòng ngựa, gắn với alias `horse` của query builder.
 * Cùng luật với placementStatusOf trong policies/horse.policy.ts.
 */
const PLACEMENT_STATUS_SQL = `CASE
  WHEN horse.lifecycle_status = '${HorseLifecycleStatus.TRANSFERRED}' THEN '${HorsePlacementStatus.NOT_APPLICABLE}'
  WHEN horse.barn_id IS NULL THEN '${HorsePlacementStatus.PENDING_BARN}'
  WHEN NOT EXISTS (SELECT 1 FROM stall_assignments sa WHERE sa.horse_id = horse.id AND sa.end_at IS NULL) THEN '${HorsePlacementStatus.PENDING_STALL}'
  ELSE '${HorsePlacementStatus.PLACED}'
END`;

/**
 * Biểu thức SQL tính độ ưu tiên sức khỏe của một dòng ngựa, gắn với alias `horse` của query builder.
 * Chấn thương/cách ly là 0, cần theo dõi là 1, còn lại là 2.
 */
const HEALTH_PRIORITY_SQL = `CASE horse.health_status WHEN '${HorseHealthStatus.INJURED}' THEN 0 WHEN '${HorseHealthStatus.QUARANTINED}' THEN 0 WHEN '${HorseHealthStatus.UNDER_OBSERVATION}' THEN 1 ELSE 2 END`;

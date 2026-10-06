import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { StallAssignmentEntity } from '../../stable/entities/stall-assignment.entity';
import { HorseListSortBy } from '../enums/horse-list-sort.enum';
import { HorsePlacementStatus } from '../enums/horse-placement-status.enum';
import { HorseHealthStatus } from '../enums/horse-status.enum';
import { HorseListQueryDto } from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import { applyHorseScope } from '../utils/horse-scope';
import type {
  HorseLocationRow,
  HorseScope,
  PedigreeAncestorRow,
} from '../types/horse.types';
import {
  READ_ONLY_LIFECYCLE_STATUSES,
  VIETNAMESE_NAME_ORDER,
} from '../constants/horse.constants';

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
    return this.horses
      .createQueryBuilder('horse')
      .withDeleted()
      .leftJoin('horse.barn', 'barn', 'barn.deletedAt IS NULL')
      .leftJoin(
        StallAssignmentEntity,
        'assignment',
        'assignment.horseId = horse.id AND assignment.endAt IS NULL',
      )
      .leftJoin('assignment.stall', 'stall', 'stall.deletedAt IS NULL')
      .select('horse.id', 'horseId')
      .addSelect('barn.id', 'barnId')
      .addSelect('barn.name', 'barnName')
      .addSelect('stall.id', 'stallId')
      .addSelect('stall.code', 'stallCode')
      .where('horse.id IN (:...horseIds)', { horseIds })
      .getRawMany<HorseLocationRow>();
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
        WITH RECURSIVE pedigree (id, child_id, parent_role, generation, path) AS (
          SELECT $1::uuid, NULL::uuid, NULL::text, 0, ARRAY[$1::uuid]

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
        WHERE pedigree.generation > 0
        ORDER BY pedigree.generation,
                 (pedigree.parent_role = 'SIRE') DESC,
                 ancestor.name,
                 pedigree.child_id
      `,
      [horseId, depth],
    );
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
        (outer: SelectQueryBuilder<HorseEntity>) =>
          `horse.barnId IN ${outer
            .subQuery()
            .select('barn.id')
            .from(BarnEntity, 'barn')
            .where('barn.headTrainerId = :callerId')
            .andWhere('barn.deletedAt IS NULL')
            .getQuery()}`,
        { callerId },
      );
    }
    if (query.myHorses) {
      qb.andWhere(
        (outer: SelectQueryBuilder<HorseEntity>) =>
          `EXISTS ${outer
            .subQuery()
            .select('1')
            .from(GroomAssignmentEntity, 'assignment')
            .where('assignment.horseId = horse.id')
            .andWhere('assignment.groomId = :callerId')
            .andWhere('assignment.endAt IS NULL')
            .getQuery()}`,
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
}

/**
 * Biểu thức SQL tính HorsePlacementStatus của một dòng ngựa, gắn với alias `horse` của query builder.
 */
const PLACEMENT_STATUS_SQL = `CASE
  WHEN horse.lifecycle_status IN (${READ_ONLY_LIFECYCLE_STATUSES.map((status) => `'${status}'`).join(', ')}) THEN '${HorsePlacementStatus.NOT_APPLICABLE}'
  WHEN horse.barn_id IS NULL THEN '${HorsePlacementStatus.PENDING_BARN}'
  WHEN NOT EXISTS (SELECT 1 FROM stall_assignments sa WHERE sa.horse_id = horse.id AND sa.end_at IS NULL) THEN '${HorsePlacementStatus.PENDING_STALL}'
  ELSE '${HorsePlacementStatus.PLACED}'
END`;

/**
 * Biểu thức SQL tính độ ưu tiên sức khỏe của một dòng ngựa, gắn với alias `horse` của query builder.
 * Chấn thương/cách ly là 0, cần theo dõi là 1, còn lại là 2.
 */
const HEALTH_PRIORITY_SQL = `CASE horse.health_status WHEN '${HorseHealthStatus.INJURED}' THEN 0 WHEN '${HorseHealthStatus.QUARANTINED}' THEN 0 WHEN '${HorseHealthStatus.UNDER_OBSERVATION}' THEN 1 ELSE 2 END`;

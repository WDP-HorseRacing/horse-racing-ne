import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  IsNull,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { HorseGender } from '../constants/horse-gender.enum';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';
import { HorseParentRole } from '../constants/horse-parent-role.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';
import { HorseListQueryDto } from '../dto/horse-list-query.dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseEntity } from '../entities/horse.entity';

export type HorseScope =
  | { kind: 'CLUB' }
  | { kind: 'GROOM'; userId: string }
  | { kind: 'OWNER'; userId: string };

export interface PedigreeAncestorRow {
  id: string;
  name: string;
  gender: HorseGender | null;
  raceAptitude: RaceAptitude | null;
  isReference: boolean;
  generation: number;
  parentRole: HorseParentRole;
  childId: string;
}

@Injectable()
export class HorsesRepository {
  constructor(
    @InjectRepository(HorseEntity)
    private readonly horses: Repository<HorseEntity>,
    @InjectRepository(HorseOwnershipEntity)
    private readonly ownerships: Repository<HorseOwnershipEntity>,
    @InjectRepository(HorseMeasurementEntity)
    private readonly measurements: Repository<HorseMeasurementEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findInClub(id: string, clubId: string): Promise<HorseEntity | null> {
    return this.horses.findOneBy({ id, clubId });
  }

  findWithParents(id: string, clubId: string): Promise<HorseEntity | null> {
    return this.horses.findOne({
      where: { id, clubId },
      relations: { sire: true, dam: true },
    });
  }

  list(
    clubId: string,
    scope: HorseScope,
    query: HorseListQueryDto,
  ): Promise<[HorseEntity[], number]> {
    const qb = this.horses
      .createQueryBuilder('horse')
      .where('horse.clubId = :clubId', { clubId })
      .andWhere('horse.isReference = :reference', {
        reference: query.reference,
      });
    this.applyScope(qb, scope);

    if (query.search) {
      qb.andWhere(
        '(horse.name ILIKE :search OR horse.microchipId ILIKE :search)',
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

    return qb
      .orderBy('horse.name', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
  }

  async isVisible(horseId: string, scope: HorseScope): Promise<boolean> {
    if (scope.kind === 'CLUB') return true;
    const qb = this.horses
      .createQueryBuilder('horse')
      .where('horse.id = :horseId', { horseId });
    this.applyScope(qb, scope);
    return (await qb.getCount()) > 0;
  }

  listOwnedBy(ownerId: string, clubId: string): Promise<HorseEntity[]> {
    return this.horses
      .createQueryBuilder('horse')
      .where('horse.clubId = :clubId', { clubId })
      .andWhere(
        'EXISTS (SELECT 1 FROM horse_ownerships ho WHERE ho.horse_id = horse.id AND ho.owner_id = :ownerId AND ho.end_date IS NULL)',
        { ownerId },
      )
      .orderBy('horse.name', 'ASC')
      .getMany();
  }

  async parentUsage(
    horseId: string,
  ): Promise<{ asSire: boolean; asDam: boolean }> {
    const [asSire, asDam] = await Promise.all([
      this.horses.existsBy({ sireId: horseId }),
      this.horses.existsBy({ damId: horseId }),
    ]);
    return { asSire, asDam };
  }

  hasOwnershipHistory(horseId: string): Promise<boolean> {
    return this.ownerships.existsBy({ horseId });
  }

  async hasActiveTrainingLock(horseId: string): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM training_locks WHERE horse_id = $1 AND status = $2) AS exists`,
      [horseId, TrainingLockStatus.ACTIVE],
    );
    return rows[0]?.exists === true;
  }

  listOwnershipByHorse(horseId: string): Promise<HorseOwnershipEntity[]> {
    return this.ownerships.find({
      where: { horseId },
      relations: { owner: true },
      order: {
        endDate: { direction: 'DESC', nulls: 'FIRST' },
        startDate: 'DESC',
      },
    });
  }

  async closeActiveOwnerships(
    manager: EntityManager,
    horseId: string,
    endDate: string,
  ): Promise<void> {
    await manager
      .getRepository(HorseOwnershipEntity)
      .update({ horseId, endDate: IsNull() }, { endDate });
  }

  latestMeasurements(horseId: string): Promise<HorseMeasurementEntity[]> {
    return this.measurements
      .createQueryBuilder('m')
      .distinctOn(['m.type'])
      .where('m.horseId = :horseId', { horseId })
      .orderBy('m.type', 'ASC')
      .addOrderBy('m.measuredAt', 'DESC')
      .getMany();
  }

  listMeasurements(
    horseId: string,
    type?: HorseMeasurementType,
  ): Promise<HorseMeasurementEntity[]> {
    return this.measurements.find({
      where: { horseId, ...(type ? { type } : {}) },
      relations: { measurer: true },
      order: { measuredAt: 'DESC' },
      take: 200,
    });
  }

  async addMeasurement(
    measurement: Pick<
      HorseMeasurementEntity,
      'horseId' | 'type' | 'value' | 'measuredAt' | 'measuredBy'
    >,
  ): Promise<HorseMeasurementEntity> {
    const saved = await this.measurements.save(
      this.measurements.create(measurement),
    );
    return this.measurements.findOneOrFail({
      where: { id: saved.id },
      relations: { measurer: true },
    });
  }

  async wouldCreateCycle(
    childHorseId: string,
    parentHorseId: string,
  ): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.dataSource.query(
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

  findPedigreeAncestors(
    horseId: string,
    clubId: string,
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
            AND child.club_id = $2::uuid
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
          WHERE pedigree.generation < $3::integer
            AND parent.deleted_at IS NULL
            AND NOT parent.id = ANY(pedigree.path)
        )
        SELECT ancestor.id,
               ancestor.name,
               ancestor.gender,
               ancestor.race_aptitude AS "raceAptitude",
               ancestor.is_reference AS "isReference",
               pedigree.generation,
               pedigree.parent_role AS "parentRole",
               pedigree.child_id AS "childId"
        FROM pedigree
        JOIN horses ancestor ON ancestor.id = pedigree.id
        WHERE ancestor.club_id = $2::uuid
        ORDER BY pedigree.generation, pedigree.parent_role DESC, ancestor.name
      `,
      [horseId, clubId, depth],
    );
  }

  private applyScope(qb: SelectQueryBuilder<HorseEntity>, scope: HorseScope) {
    if (scope.kind === 'GROOM') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM stable_assignments sa WHERE sa.horse_id = horse.id AND sa.groom_id = :scopeUserId AND sa.end_at IS NULL)',
        { scopeUserId: scope.userId },
      );
    }
    if (scope.kind === 'OWNER') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM horse_ownerships ho WHERE ho.horse_id = horse.id AND ho.owner_id = :scopeUserId AND ho.end_date IS NULL)',
        { scopeUserId: scope.userId },
      );
    }
  }
}

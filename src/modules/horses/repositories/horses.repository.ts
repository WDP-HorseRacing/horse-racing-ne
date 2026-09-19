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
import { HorseListQueryDto } from '../dto/horse.dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseEntity } from '../entities/horse.entity';

export type HorseScope =
  | { kind: 'ALL' }
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

  /**
   * Find a horse by id
   * @param id The ID of the horse
   * @returns A promise resolving to the horse, or null if not found
   */
  findById(id: string): Promise<HorseEntity | null> {
    return this.horses.findOneBy({ id });
  }

  /**
   * Find a horse by id with its sire and dam loaded
   * @param id The ID of the horse
   * @returns A promise resolving to the horse with parents, or null if not found
   */
  findWithParents(id: string): Promise<HorseEntity | null> {
    return this.horses.findOne({
      where: { id },
      relations: { sire: true, dam: true },
    });
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

  /**
   * Check whether a horse is visible within the given scope
   * @param horseId The ID of the horse
   * @param scope The visibility scope of the caller
   * @returns A promise resolving to true if the horse is visible
   */
  async isVisible(horseId: string, scope: HorseScope): Promise<boolean> {
    if (scope.kind === 'ALL') return true;
    const qb = this.horses
      .createQueryBuilder('horse')
      .where('horse.id = :horseId', { horseId });
    this.applyScope(qb, scope);
    return (await qb.getCount()) > 0;
  }

  /**
   * List horses currently owned by a user
   * @param ownerId The ID of the owner
   * @returns A promise resolving to the horses with an open ownership
   */
  listOwnedBy(ownerId: string): Promise<HorseEntity[]> {
    return this.horses
      .createQueryBuilder('horse')
      .where(
        'EXISTS (SELECT 1 FROM horse_ownerships ho WHERE ho.horse_id = horse.id AND ho.owner_id = :ownerId AND ho.end_date IS NULL)',
        { ownerId },
      )
      .orderBy('horse.name', 'ASC')
      .getMany();
  }

  /**
   * Check whether a horse is referenced as a sire or dam by other horses
   * @param horseId The ID of the horse
   * @returns A promise resolving to the sire and dam usage flags
   */
  async parentUsage(
    horseId: string,
  ): Promise<{ asSire: boolean; asDam: boolean }> {
    const [asSire, asDam] = await Promise.all([
      this.horses.existsBy({ sireId: horseId }),
      this.horses.existsBy({ damId: horseId }),
    ]);
    return { asSire, asDam };
  }

  /**
   * Check whether a horse has any ownership record, open or closed
   * @param horseId The ID of the horse
   * @returns A promise resolving to true if an ownership record exists
   */
  hasOwnershipHistory(horseId: string): Promise<boolean> {
    return this.ownerships.existsBy({ horseId });
  }

  /**
   * Check whether a horse has an active training lock
   * @param horseId The ID of the horse
   * @returns A promise resolving to true if an active lock exists
   */
  async hasActiveTrainingLock(horseId: string): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM training_locks WHERE horse_id = $1 AND status = $2) AS exists`,
      [horseId, TrainingLockStatus.ACTIVE],
    );
    return rows[0]?.exists === true;
  }

  /**
   * List the ownership history of a horse, open ownerships first
   * @param horseId The ID of the horse
   * @returns A promise resolving to the ownerships with their owners
   */
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

  /**
   * Close all open ownerships of a horse within a transaction
   * @param manager The transaction entity manager
   * @param horseId The ID of the horse
   * @param endDate The end date to set on the open ownerships
   * @returns A promise that resolves once the ownerships are closed
   */
  async closeActiveOwnerships(
    manager: EntityManager,
    horseId: string,
    endDate: string,
  ): Promise<void> {
    await manager
      .getRepository(HorseOwnershipEntity)
      .update({ horseId, endDate: IsNull() }, { endDate });
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
   * List measurements of a horse, newest first, capped at 200 records
   * @param horseId The ID of the horse
   * @param type Optional measurement type to filter by
   * @returns A promise resolving to the measurements with their measurers
   */
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

  /**
   * Persist a new measurement for a horse
   * @param measurement The measurement fields to persist
   * @returns A promise resolving to the saved measurement with its measurer
   */
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

  /**
   * Check whether assigning a parent would create a cycle in the pedigree
   * @param childHorseId The ID of the child horse
   * @param parentHorseId The ID of the candidate parent horse
   * @returns A promise resolving to true if the child is already an ancestor of the parent
   */
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

  /**
   * Restrict a horse query to the caller's scope: grooms see horses currently assigned to them, owners see horses they currently own, the ALL scope is unrestricted
   * @param qb The horse query builder to restrict
   * @param scope The visibility scope of the caller
   */
  private applyScope(qb: SelectQueryBuilder<HorseEntity>, scope: HorseScope) {
    if (scope.kind === 'GROOM') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM stall_assignments sa WHERE sa.horse_id = horse.id AND sa.groom_id = :scopeUserId AND sa.end_at IS NULL)',
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

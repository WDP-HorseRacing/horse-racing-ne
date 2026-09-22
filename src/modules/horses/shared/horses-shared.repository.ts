import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { HorseEntity } from '../entities/horse.entity';
import type { HorseScope } from '../types/horse.types';
import { applyHorseScope } from '../utils/horse-scope';

/**
 * Các query về ngựa mà nhiều feature trong module horses cùng dùng.
 */
@Injectable()
export class HorsesSharedRepository {
  constructor(
    @InjectRepository(HorseEntity)
    private readonly horses: Repository<HorseEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Find a horse by id
   * @param id The ID of the horse
   * @param manager The transaction entity manager, omitted outside a transaction
   * @returns A promise resolving to the horse, or null if not found
   */
  findById(id: string, manager?: EntityManager): Promise<HorseEntity | null> {
    return (
      manager ? manager.getRepository(HorseEntity) : this.horses
    ).findOneBy({ id });
  }

  /**
   * Tìm con ngựa chưa xóa và khóa row của nó (pessimistic_write) tới hết transaction.
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise trả về con ngựa đã khóa, hoặc null nếu không có
   */
  lockHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseEntity | null> {
    return manager.getRepository(HorseEntity).findOne({
      where: { id: horseId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Check whether a horse is visible within the given scope
   * @param horseId The ID of the horse
   * @param scope The visibility scope of the caller
   * @returns A promise resolving to true if the horse is visible
   */
  async isVisible(
    horseId: string,
    scope: HorseScope,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (scope.kind === 'ALL') return true;
    const qb = (manager ? manager.getRepository(HorseEntity) : this.horses)
      .createQueryBuilder('horse')
      .where('horse.id = :horseId', { horseId });
    applyHorseScope(qb, scope);
    return (await qb.getCount()) > 0;
  }

  /**
   * Check whether a horse has an active training lock
   * @param horseId The ID of the horse
   * @returns A promise resolving to true if an active lock exists
   */
  async hasActiveTrainingLock(
    horseId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await (
      manager ?? this.dataSource
    ).query(
      `SELECT EXISTS (SELECT 1 FROM training_locks WHERE horse_id = $1 AND status = $2) AS exists`,
      [horseId, TrainingLockStatus.ACTIVE],
    );
    return rows[0]?.exists === true;
  }

  /**
   * Kiểm tra groom có đang được giao chăm con ngựa không (dòng groom_assignments còn mở).
   *
   * @param horseId UUID của ngựa
   * @param groomId UUID của groom
   * @returns true nếu groom đang phụ trách con ngựa này
   */
  isGroomAssigned(
    horseId: string,
    groomId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return (manager ?? this.dataSource)
      .getRepository(GroomAssignmentEntity)
      .existsBy({ horseId, groomId, endAt: IsNull() });
  }
}

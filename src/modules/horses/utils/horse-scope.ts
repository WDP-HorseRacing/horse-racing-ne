import { SelectQueryBuilder } from 'typeorm';
import { HorseEntity } from '../entities/horse.entity';
import type { HorseScope } from '../types/horse.types';

/**
 * Restrict a horse query to the caller's scope: owners see horses they currently own, the ALL scope is unrestricted
 * @param qb The horse query builder to restrict
 * @param scope The visibility scope of the caller
 */
export function applyHorseScope(
  qb: SelectQueryBuilder<HorseEntity>,
  scope: HorseScope,
): void {
  if (scope.kind === 'OWNER') {
    qb.andWhere(
      'EXISTS (SELECT 1 FROM horse_ownerships ho WHERE ho.horse_id = horse.id AND ho.owner_id = :scopeUserId AND ho.end_at IS NULL)',
      { scopeUserId: scope.userId },
    );
  }
}

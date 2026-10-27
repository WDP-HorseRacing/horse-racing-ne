import { SelectQueryBuilder } from 'typeorm';
import { HorseEntity } from '../entities/horse.entity';
import type { HorseScope } from '../types/horse.types';

/**
 * Giới hạn query ngựa theo phạm vi của người gọi: Horse Owner chỉ thấy ngựa mình đang sở hữu, phạm vi ALL không giới hạn
 *
 * @param qb Query builder ngựa cần giới hạn
 * @param scope Phạm vi xem của người gọi
 */
export function applyHorseScope(
  qb: SelectQueryBuilder<HorseEntity>,
  scope: HorseScope,
): void {
  if (scope.kind === 'OWNER') {
    qb.andWhere('horse.ownerId = :scopeUserId', {
      scopeUserId: scope.userId,
    });
  }
}

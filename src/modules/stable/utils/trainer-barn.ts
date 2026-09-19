import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';

/**
 * Check whether a horse is currently stabled in a barn led by the given head trainer
 * @param manager The entity manager to run the query with
 * @param horseId The ID of the horse
 * @param trainerId The ID of the head trainer
 * @returns A promise resolving to true if the horse has an active stall assignment in one of the trainer's barns
 */
export async function isHorseInTrainerBarn(
  manager: EntityManager,
  horseId: string,
  trainerId: string,
): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `SELECT 1
       FROM stall_assignments sa
       JOIN stalls s ON s.id = sa.stall_id AND s.deleted_at IS NULL
       JOIN barns b ON b.id = s.barn_id AND b.deleted_at IS NULL
      WHERE sa.horse_id = $1
        AND sa.end_at IS NULL
        AND b.head_trainer_id = $2
      LIMIT 1`,
    [horseId, trainerId],
  );
  return rows.length > 0;
}

/**
 * Ensure a head trainer only makes decisions or reads sensitive data for horses in their own barn; other roles pass through
 * @param manager The entity manager to run the query with
 * @param actor The actor resolved from the JWT
 * @param callerId The ID of the caller
 * @param horseId The ID of the horse
 * @throws ForbiddenException if the actor is a head trainer and the horse is not in their barn
 */
export async function assertTrainerBarn(
  manager: EntityManager,
  actor: Actor,
  callerId: string,
  horseId: string,
): Promise<void> {
  if (
    !actor.roles.includes(UserRole.HEAD_TRAINER) ||
    actor.roles.includes(UserRole.CLUB_MANAGER)
  ) {
    return;
  }
  if (!(await isHorseInTrainerBarn(manager, horseId, callerId))) {
    throw new ForbiddenException('Ngựa không thuộc khu bạn phụ trách');
  }
}

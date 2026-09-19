import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { UserEntity } from '../entities/user.entity';

export type CurrentActorUser = UserEntity & {
  role: UserRole;
};

const actorUserCache = new WeakMap<Actor, Promise<CurrentActorUser>>();

/**
 * Find the active user linked to a Keycloak account
 * @param manager The entity manager to run the query with
 * @param keycloakId The Keycloak ID of the user
 * @returns A promise resolving to the active user
 * @throws ForbiddenException if the user does not exist or is not active
 */
export async function currentUser(
  manager: EntityManager,
  keycloakId: string,
): Promise<UserEntity> {
  const user = await manager.findOne(UserEntity, { where: { keycloakId } });
  if (!user) {
    throw new ForbiddenException('Tài khoản không tồn tại');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new ForbiddenException('Tài khoản không ở trạng thái hoạt động');
  }
  return user;
}

/**
 * Resolve the business user for an actor, cached per actor object
 * @param manager The entity manager to run the query with
 * @param actor The actor resolved from the JWT
 * @returns A promise resolving to the user with an assigned role
 * @throws ForbiddenException if the user is missing, inactive, or has no role
 */
export function currentUserForActor(
  manager: EntityManager,
  actor: Actor,
): Promise<CurrentActorUser> {
  const cached = actorUserCache.get(actor);
  if (cached) return cached;

  const pending = currentUser(manager, actor.sub).then((user) => {
    assertAssignedUser(user);
    return user;
  });
  actorUserCache.set(actor, pending);
  return pending;
}

/**
 * Assert that a user has been assigned a role
 * @param user The user to check
 * @throws ForbiddenException if the user has no role
 */
function assertAssignedUser(
  user: UserEntity,
): asserts user is CurrentActorUser {
  if (!user.role) {
    throw new ForbiddenException('Tài khoản chưa được gán vai trò');
  }
}

/**
 * Ensure the actor has at least one of the given roles
 * @param actor The actor resolved from the JWT
 * @param roles The roles allowed to perform the action
 * @throws ForbiddenException if the actor has none of the given roles
 */
export function role(actor: Actor, ...roles: UserRole[]): void {
  if (!roles.some((r) => actor.roles.includes(r))) {
    throw new ForbiddenException('Không đủ quyền cho thao tác này');
  }
}

import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { UserEntity } from '../entities/user.entity';

export type CurrentActorUser = UserEntity & {
  role: UserRole;
};

/**
 * Kết quả tra tài khoản local theo Keycloak ID
 *
 * - ACTIVE: có tài khoản và đang hoạt động
 * - NOT_FOUND: chưa có row users (hoặc đã xóa mềm)
 * - INACTIVE: có tài khoản nhưng đang INACTIVE hoặc LOCKED
 */
export type AccountLookup =
  | { kind: 'ACTIVE'; user: UserEntity }
  | { kind: 'NOT_FOUND' }
  | { kind: 'INACTIVE'; user: UserEntity };

const actorUserCache = new WeakMap<Actor, Promise<CurrentActorUser>>();

/**
 * Tra tài khoản local gắn với một tài khoản Keycloak, không ném lỗi để mỗi nơi gọi tự chọn mã lỗi riêng
 *
 * - Dùng chung cho currentUser (trả 403) và ProvisioningService (trả 401)
 *
 * @param manager EntityManager dùng để query
 * @param keycloakId Keycloak ID (claim sub) của tài khoản
 * @returns A promise resolving to kết quả tra: ACTIVE, NOT_FOUND hoặc INACTIVE
 */
export async function lookupAccount(
  manager: EntityManager,
  keycloakId: string,
): Promise<AccountLookup> {
  const user = await manager.findOne(UserEntity, { where: { keycloakId } });
  if (!user) return { kind: 'NOT_FOUND' };
  if (user.status !== UserStatus.ACTIVE) return { kind: 'INACTIVE', user };
  return { kind: 'ACTIVE', user };
}

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
  const account = await lookupAccount(manager, keycloakId);
  if (account.kind === 'NOT_FOUND') {
    throw new ForbiddenException('Tài khoản không tồn tại');
  }
  if (account.kind === 'INACTIVE') {
    throw new ForbiddenException('Tài khoản không ở trạng thái hoạt động');
  }
  return account.user;
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

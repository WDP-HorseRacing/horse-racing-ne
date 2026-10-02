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
 * Tra tài khoản local gắn với một tài khoản Keycloak, không ném lỗi
 *
 * @param manager EntityManager dùng để query
 * @param keycloakId Keycloak ID (claim sub) của tài khoản
 * @returns Promise trả về kết quả tra: ACTIVE, NOT_FOUND hoặc INACTIVE
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
 * Lấy tài khoản local đang hoạt động gắn với một tài khoản Keycloak
 *
 * @param manager EntityManager dùng để query
 * @param keycloakId Keycloak ID (claim sub) của tài khoản
 * @returns Promise trả về user đang hoạt động
 * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không ở trạng thái hoạt động
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
 * Lấy user nghiệp vụ của người gọi, cache theo từng object actor
 *
 * @param manager EntityManager dùng để query
 * @param actor Thông tin danh tính từ Access Token
 * @returns Promise trả về user đang hoạt động và đã được gán vai trò
 * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
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
 * Bắt buộc user đã được gán vai trò
 *
 * @param user User cần kiểm
 * @throws ForbiddenException Nếu user chưa được gán vai trò
 */
function assertAssignedUser(
  user: UserEntity,
): asserts user is CurrentActorUser {
  if (!user.role) {
    throw new ForbiddenException('Tài khoản chưa được gán vai trò');
  }
}

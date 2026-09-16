import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { UserEntity } from '../entities/user.entity';

export type CurrentActorUser = UserEntity & {
  clubId: string;
  role: UserRole;
};

const actorUserCache = new WeakMap<Actor, Promise<CurrentActorUser>>();

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
 * Resolve Actor từ JWT sang user nghiệp vụ. Kết quả được cache theo object
 * Actor nên các service dùng chung một request không query lại bảng users.
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

function assertAssignedUser(
  user: UserEntity,
): asserts user is CurrentActorUser {
  if (!user.clubId || !user.role) {
    throw new ForbiddenException(
      'Tài khoản chưa được gán câu lạc bộ hoặc vai trò',
    );
  }
}

/**
 * Kiểm tra role của user ứng với actor có tồn tại role đó hay không.
 * Nếu không tồn tại role đó thì ném ra ForbiddenException.
 * Nếu tồn tại role đó thì trả về void.
 */
export function role(actor: Actor, ...roles: UserRole[]): void {
  if (!roles.some((r) => actor.roles.includes(r))) {
    throw new ForbiddenException('Không đủ quyền cho thao tác này');
  }
}

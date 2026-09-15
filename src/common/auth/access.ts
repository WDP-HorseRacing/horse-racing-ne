import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserEntity } from '../../modules/users/entities/user.entity';
import { UserStatus } from '../../modules/users/user.enums';
import type { Actor } from './actor';

/**
 * Doi mot Actor lay row `users` tuong ung.
 *
 * Guard goi ham nay de CHAN (phai co ho so, phai dang hoat dong).
 */
export async function currentUser(
  manager: EntityManager,
  actor: Actor,
): Promise<UserEntity> {
  const user = await manager.findOne(UserEntity, {
    where: { keycloakId: actor.sub },
  });
  if (!user) {
    throw new ForbiddenException('Tài khoản không tồn tại');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new ForbiddenException('Tài khoản không ở trạng thái hoạt động');
  }
  return user;
}

export function role(actor: Actor, ...roles: string[]): void {
  if (!roles.some((r) => actor.roles.includes(r))) {
    throw new ForbiddenException('Không đủ quyền cho thao tác này');
  }
}

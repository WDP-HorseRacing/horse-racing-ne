import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { UserEntity } from '../entities/user.entity';

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
 * Kiểm tra role của user ứng với actor có tồn tại role đó hay không.
 * Nếu không tồn tại role đó thì ném ra ForbiddenException.
 * Nếu tồn tại role đó thì trả về void.
 */
export function role(actor: Actor, ...roles: string[]): void {
  if (!roles.some((r) => actor.roles.includes(r))) {
    throw new ForbiddenException('Không đủ quyền cho thao tác này');
  }
}

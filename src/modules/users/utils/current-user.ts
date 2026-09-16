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

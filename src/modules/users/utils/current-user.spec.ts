import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { UserEntity } from '../entities/user.entity';
import {
  currentUser,
  currentUserForActor,
  lookupAccount,
} from './current-user';

describe('current-user', () => {
  let findOne: jest.Mock;
  let manager: EntityManager;

  beforeEach(() => {
    findOne = jest.fn();
    manager = { findOne } as unknown as EntityManager;
  });

  describe('lookupAccount', () => {
    it('reports NOT_FOUND when no local account exists', async () => {
      findOne.mockResolvedValue(null);

      await expect(lookupAccount(manager, 'kc-1')).resolves.toEqual({
        kind: 'NOT_FOUND',
      });
      expect(findOne).toHaveBeenCalledWith(UserEntity, {
        where: { keycloakId: 'kc-1' },
      });
    });

    it('reports INACTIVE for a locked account', async () => {
      const user = { id: 'user-1', status: UserStatus.LOCKED };
      findOne.mockResolvedValue(user);

      await expect(lookupAccount(manager, 'kc-1')).resolves.toEqual({
        kind: 'INACTIVE',
        user,
      });
    });

    it('reports ACTIVE with the user for an active account', async () => {
      const user = { id: 'user-1', status: UserStatus.ACTIVE };
      findOne.mockResolvedValue(user);

      await expect(lookupAccount(manager, 'kc-1')).resolves.toEqual({
        kind: 'ACTIVE',
        user,
      });
    });
  });

  describe('currentUser', () => {
    it('returns 403 when the account does not exist', async () => {
      findOne.mockResolvedValue(null);

      await expect(currentUser(manager, 'kc-1')).rejects.toThrow(
        new ForbiddenException('Tài khoản không tồn tại'),
      );
    });

    it('returns 403 when the account is not active', async () => {
      findOne.mockResolvedValue({ id: 'user-1', status: UserStatus.INACTIVE });

      await expect(currentUser(manager, 'kc-1')).rejects.toThrow(
        new ForbiddenException('Tài khoản không ở trạng thái hoạt động'),
      );
    });
  });

  describe('currentUserForActor', () => {
    const actorOf = (): Actor => ({ sub: 'kc-1', roles: [UserRole.GROOM] });

    it('returns the active user with a role and caches it per actor', async () => {
      const user = {
        id: 'user-1',
        status: UserStatus.ACTIVE,
        role: UserRole.GROOM,
      };
      findOne.mockResolvedValue(user);
      const actor = actorOf();

      await expect(currentUserForActor(manager, actor)).resolves.toBe(user);
      await expect(currentUserForActor(manager, actor)).resolves.toBe(user);
      expect(findOne).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when the active user has no role', async () => {
      findOne.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        role: null,
      });

      await expect(currentUserForActor(manager, actorOf())).rejects.toThrow(
        new ForbiddenException('Tài khoản chưa được gán vai trò'),
      );
    });

    it('returns 403 when the account is missing', async () => {
      findOne.mockResolvedValue(null);

      await expect(currentUserForActor(manager, actorOf())).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});

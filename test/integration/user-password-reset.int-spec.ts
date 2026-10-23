import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { KeycloakUserService } from '../../src/common/infrastructure/keycloak/user.service';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { UsersService } from '../../src/modules/users/services/users.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('UsersService.resetPassword (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let keycloak: jest.Mocked<
    Pick<KeycloakUserService, 'resetUserPassword' | 'logoutUser'>
  >;
  let users: UsersService;
  let manager: Actor;
  let managerId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    keycloak = { resetUserPassword: jest.fn(), logoutUser: jest.fn() };
    users = new UsersService(
      dataSource.getRepository(UserEntity),
      keycloak as unknown as KeycloakUserService,
      dataSource,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    jest.resetAllMocks();
    managerId = await seed.user(UserRole.CLUB_MANAGER);
    manager = {
      sub: await keycloakIdOf(managerId),
      roles: [UserRole.CLUB_MANAGER],
    };
  });

  const keycloakIdOf = async (id: string): Promise<string> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return row.keycloak_id;
  };

  const auditRows = () =>
    dataSource.query<Array<Record<string, unknown>>>(
      `SELECT actor_id, action, entity_type, entity_id, before_data, after_data, reason, feature
         FROM audit_logs ORDER BY created_at, id`,
    );

  it('sets a normal password, signs out every session and logs it without the password', async () => {
    const groom = await seed.user(UserRole.GROOM);
    const groomKeycloakId = await keycloakIdOf(groom);

    await users.resetPassword(manager, groom, 'MatKhauMoi1');

    expect(keycloak.resetUserPassword).toHaveBeenCalledWith(
      groomKeycloakId,
      'MatKhauMoi1',
    );
    expect(keycloak.logoutUser).toHaveBeenCalledWith(groomKeycloakId);
    await expect(auditRows()).resolves.toEqual([
      {
        actor_id: managerId,
        action: 'PASSWORD_CHANGE',
        entity_type: 'USER',
        entity_id: groom,
        before_data: null,
        after_data: null,
        reason: null,
        feature: 'USER_ACCOUNT',
      },
    ]);
  });

  it('commits the audit row before calling Keycloak', async () => {
    const groom = await seed.user(UserRole.GROOM);
    let committedRows = -1;
    keycloak.resetUserPassword.mockImplementation(async () => {
      committedRows = (await auditRows()).length;
    });

    await users.resetPassword(manager, groom, 'MatKhauMoi1');

    expect(committedRows).toBe(1);
  });

  it('resets the password of a locked account', async () => {
    const locked = await seed.user(UserRole.VETERINARIAN, UserStatus.INACTIVE);

    await users.resetPassword(manager, locked, 'MatKhauMoi1');

    expect(keycloak.resetUserPassword).toHaveBeenCalled();
  });

  it('rejects resetting the own password with 400 and points to change password', async () => {
    const error = await users
      .resetPassword(manager, managerId, 'MatKhauMoi1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      'Không thể tự đặt lại mật khẩu của chính mình, hãy dùng chức năng đổi mật khẩu',
    );
    expect(keycloak.resetUserPassword).not.toHaveBeenCalled();
    await expect(auditRows()).resolves.toEqual([]);
  });

  it('rejects resetting another club manager with 403', async () => {
    const other = await seed.user(UserRole.CLUB_MANAGER);

    const error = await users
      .resetPassword(manager, other, 'MatKhauMoi1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe(
      'Không thể đặt lại mật khẩu của Club Manager khác',
    );
    expect(keycloak.resetUserPassword).not.toHaveBeenCalled();
    await expect(auditRows()).resolves.toEqual([]);
  });

  it('answers 404 for an unknown or deleted user', async () => {
    const deleted = await seed.user(UserRole.GROOM);
    await dataSource.query(
      'UPDATE users SET deleted_at = now() WHERE id = $1',
      [deleted],
    );

    for (const id of [randomUUID(), deleted]) {
      await expect(
        users.resetPassword(manager, id, 'MatKhauMoi1'),
      ).rejects.toThrow(NotFoundException);
    }
    expect(keycloak.resetUserPassword).not.toHaveBeenCalled();
  });

  it('does not sign out sessions when Keycloak rejects the new password', async () => {
    const groom = await seed.user(UserRole.GROOM);
    keycloak.resetUserPassword.mockRejectedValue(new Error('Keycloak down'));

    await expect(
      users.resetPassword(manager, groom, 'MatKhauMoi1'),
    ).rejects.toThrow('Keycloak down');
    expect(keycloak.logoutUser).not.toHaveBeenCalled();
    const rows = await auditRows();
    expect(rows.map((row) => [row.actor_id, row.action, row.reason])).toEqual([
      [managerId, 'PASSWORD_CHANGE', null],
      [null, 'PASSWORD_CHANGE', 'Hoàn tác do không đồng bộ được Keycloak'],
    ]);
    expect(rows[1]).toMatchObject({
      entity_id: groom,
      before_data: null,
      after_data: null,
      feature: 'USER_ACCOUNT',
    });
  });

  it('still succeeds when signing out the sessions fails', async () => {
    const groom = await seed.user(UserRole.GROOM);
    keycloak.logoutUser.mockRejectedValue(new Error('Keycloak down'));

    await expect(
      users.resetPassword(manager, groom, 'MatKhauMoi1'),
    ).resolves.toBeUndefined();
  });
});

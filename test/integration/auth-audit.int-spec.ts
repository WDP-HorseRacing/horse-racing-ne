import { UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { AuthService } from '../../src/modules/auth/services/auth.service';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { ProvisioningService } from '../../src/modules/users/services/provisioning.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Auth audit (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: AuthService;
  let userId: string;
  let keycloakId: string;
  let email: string;
  const exchangePasswordForToken = jest.fn();
  const revokeRefreshToken = jest.fn();
  const resetUserPassword = jest.fn();
  const logoutUser = jest.fn();
  const verifyToken = jest.fn();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new AuthService(
      { exchangePasswordForToken, revokeRefreshToken } as never,
      { resetUserPassword, logoutUser } as never,
      {} as never,
      {} as never,
      { verifyToken } as never,
      new ProvisioningService(dataSource.getRepository(UserEntity)),
      dataSource,
      new AuditService(),
      {} as never,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    jest.resetAllMocks();
    await truncateAllTables(dataSource);
    userId = await seed.user(UserRole.HEAD_TRAINER);
    [{ keycloak_id: keycloakId, email }] = await dataSource.query<
      Array<{ keycloak_id: string; email: string }>
    >('SELECT keycloak_id, email FROM users WHERE id = $1', [userId]);
  });

  const auditRows = () =>
    dataSource.query<Array<Record<string, unknown>>>(
      'SELECT actor_id, action, entity_type, entity_id, after_data, feature FROM audit_logs ORDER BY created_at',
    );

  it('records a successful password sign-in', async () => {
    exchangePasswordForToken.mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 300,
      refresh_expires_in: 1800,
      token_type: 'Bearer',
    });
    verifyToken.mockResolvedValue({ sub: keycloakId });

    await service.login(email, 'dung');

    await expect(auditRows()).resolves.toEqual([
      {
        actor_id: userId,
        action: 'LOGIN',
        entity_type: 'USER',
        entity_id: userId,
        after_data: { method: 'PASSWORD' },
        feature: 'AUTH',
      },
    ]);
  });

  it('records a wrong password on a known email, without an actor, and skips unknown emails', async () => {
    exchangePasswordForToken.mockRejectedValue(
      new UnauthorizedException('Tài khoản hoặc mật khẩu không chính xác!'),
    );

    await expect(
      service.login(` ${email.toUpperCase()} `, 'sai'),
    ).rejects.toThrow(UnauthorizedException);
    await expect(service.login('la@test.local', 'sai')).rejects.toThrow(
      UnauthorizedException,
    );

    await expect(auditRows()).resolves.toEqual([
      expect.objectContaining({
        actor_id: null,
        action: 'LOGIN_FAILED',
        entity_id: userId,
      }),
    ]);
  });

  it('records a sign-out from the refresh token owner after revoking it', async () => {
    revokeRefreshToken.mockResolvedValue(undefined);

    await service.logout(sign({ sub: keycloakId }, 'secret'));

    expect(revokeRefreshToken).toHaveBeenCalled();
    await expect(auditRows()).resolves.toEqual([
      expect.objectContaining({
        actor_id: userId,
        action: 'LOGOUT',
        entity_id: userId,
      }),
    ]);
  });

  it('records a password change', async () => {
    exchangePasswordForToken.mockResolvedValue({});

    await service.changePassword(
      { sub: keycloakId, email, roles: [UserRole.HEAD_TRAINER] },
      'cu',
      'moi',
    );

    await expect(auditRows()).resolves.toEqual([
      expect.objectContaining({
        actor_id: userId,
        action: 'PASSWORD_CHANGE',
        entity_id: userId,
      }),
    ]);
  });
});

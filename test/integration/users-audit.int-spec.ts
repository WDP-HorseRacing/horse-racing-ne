import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { KeycloakUserService } from '../../src/common/infrastructure/keycloak/user.service';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { BarnEntity } from '../../src/modules/stable/entities/barn.entity';
import { BarnsService } from '../../src/modules/stable/barns/barns.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { HeadTrainerHandoverService } from '../../src/modules/users/services/head-trainer-handover.service';
import { UsersService } from '../../src/modules/users/services/users.service';
import { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

interface AuditRow {
  actor_id: string | null;
  action: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string | null;
  feature: string | null;
}

describe('Users audit trail (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let keycloak: jest.Mocked<
    Pick<
      KeycloakUserService,
      | 'registerUserWithPassword'
      | 'assignRealmRole'
      | 'removeRealmRole'
      | 'setUserEnabled'
      | 'deleteUser'
      | 'logoutUser'
    >
  >;
  let users: UsersService;
  let handover: HeadTrainerHandoverService;
  let manager: Actor;
  let managerId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    keycloak = {
      registerUserWithPassword: jest.fn(),
      assignRealmRole: jest.fn(),
      removeRealmRole: jest.fn(),
      setUserEnabled: jest.fn(),
      deleteUser: jest.fn(),
      logoutUser: jest.fn(),
    };
    const audit = new AuditService();
    users = new UsersService(
      dataSource.getRepository(UserEntity),
      keycloak as unknown as KeycloakUserService,
      dataSource,
      audit,
      { disconnectUser: jest.fn() } as unknown as RealtimeGateway,
    );
    handover = new HeadTrainerHandoverService(
      dataSource,
      new BarnsService(
        dataSource.getRepository(BarnEntity),
        dataSource,
        new StableAccessService(new HorseAccessService(dataSource)),
        audit,
        new TrainingAccessService(
          dataSource,
          new HorseAccessService(dataSource),
        ),
      ),
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      audit,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    jest.resetAllMocks();
    keycloak.registerUserWithPassword.mockResolvedValue(randomUUID());
    managerId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [managerId],
    );
    manager = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
  });

  const userAudits = () =>
    dataSource.query<AuditRow[]>(
      `SELECT actor_id, action, entity_id, before_data, after_data, reason, feature
         FROM audit_logs WHERE entity_type = 'USER' ORDER BY created_at, id`,
    );

  it('logs a created account without the password', async () => {
    const created = await users.create(manager, {
      fullName: ' An Nguyễn ',
      email: 'AN@test.local',
      password: 'Secret123!',
      role: UserRole.GROOM,
    });

    await expect(userAudits()).resolves.toEqual([
      {
        actor_id: managerId,
        action: 'CREATE',
        entity_id: created.id,
        before_data: null,
        after_data: {
          fullName: 'An Nguyễn',
          email: 'an@test.local',
          role: UserRole.GROOM,
          status: UserStatus.ACTIVE,
        },
        reason: null,
        feature: 'USER_ACCOUNT',
      },
    ]);
  });

  it('logs only the fields that changed and nothing when nothing changed', async () => {
    const groom = await seed.user(UserRole.GROOM);

    await users.update(manager, groom, {
      fullName: 'Bình',
      role: UserRole.GROOM,
    });
    await users.update(manager, groom, { role: UserRole.GROOM });

    await expect(userAudits()).resolves.toEqual([
      expect.objectContaining({
        actor_id: managerId,
        action: 'UPDATE',
        entity_id: groom,
        before_data: { fullName: UserRole.GROOM },
        after_data: { fullName: 'Bình' },
        feature: 'USER_ACCOUNT',
      }),
    ]);
  });

  it('logs a role change and a status change', async () => {
    const groom = await seed.user(UserRole.GROOM);

    await users.update(manager, groom, { role: UserRole.VETERINARIAN });
    await users.setStatus(manager, groom, UserStatus.INACTIVE);
    await users.setStatus(manager, groom, UserStatus.INACTIVE);

    const rows = await userAudits();
    expect(rows.map((row) => [row.before_data, row.after_data])).toEqual([
      [{ role: UserRole.GROOM }, { role: UserRole.VETERINARIAN }],
      [{ status: UserStatus.ACTIVE }, { status: UserStatus.INACTIVE }],
    ]);
  });

  it('logs a system revert when Keycloak rejects the status change', async () => {
    const groom = await seed.user(UserRole.GROOM);
    keycloak.setUserEnabled.mockRejectedValue(new Error('Keycloak down'));

    await expect(
      users.setStatus(manager, groom, UserStatus.INACTIVE),
    ).rejects.toThrow('Keycloak down');

    const rows = await userAudits();
    expect(
      rows.map((row) => [row.actor_id, row.before_data, row.after_data]),
    ).toEqual([
      [
        managerId,
        { status: UserStatus.ACTIVE },
        { status: UserStatus.INACTIVE },
      ],
      [null, { status: UserStatus.INACTIVE }, { status: UserStatus.ACTIVE }],
    ]);
    expect(rows[1]).toMatchObject({
      reason: 'Hoàn tác do không đồng bộ được Keycloak',
      feature: 'USER_ACCOUNT',
    });
  });

  it('logs a system revert when Keycloak rejects the role change', async () => {
    const groom = await seed.user(UserRole.GROOM);
    keycloak.assignRealmRole.mockRejectedValue(new Error('Keycloak down'));

    await expect(
      users.update(manager, groom, { role: UserRole.VETERINARIAN }),
    ).rejects.toThrow('Keycloak down');

    const rows = await userAudits();
    expect(
      rows.map((row) => [row.actor_id, row.before_data, row.after_data]),
    ).toEqual([
      [managerId, { role: UserRole.GROOM }, { role: UserRole.VETERINARIAN }],
      [null, { role: UserRole.VETERINARIAN }, { role: UserRole.GROOM }],
    ]);
  });

  it('logs one summary row on the head trainer who handed over', async () => {
    const from = await seed.user(UserRole.HEAD_TRAINER);
    const to = await seed.user(UserRole.HEAD_TRAINER);
    await seed.trainingClass(from, { status: 'ACTIVE' });

    await handover.handover(manager, from, { toHeadTrainerId: to });

    await expect(userAudits()).resolves.toEqual([
      {
        actor_id: managerId,
        action: 'UPDATE',
        entity_id: from,
        before_data: null,
        after_data: {
          toHeadTrainerId: to,
          barnsMoved: 0,
          plansMoved: 1,
          classesMoved: 1,
        },
        reason: null,
        feature: 'HT_HANDOVER',
      },
    ]);
  });
});

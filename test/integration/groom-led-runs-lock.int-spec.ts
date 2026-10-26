import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { KeycloakUserService } from '../../src/common/infrastructure/keycloak/user.service';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { SessionParticipantEntity } from '../../src/modules/training/entities/session-participant.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { SessionParticipantsService } from '../../src/modules/training/training-sessions/session-participants.service';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { UsersService } from '../../src/modules/users/services/users.service';
import { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Locking a groom who still leads training runs (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let users: UsersService;
  let participants: SessionParticipantsService;
  let manager: Actor;
  let trainer: Actor;
  let caringGroom: string;
  let helper: string;
  let classId: string;
  let horse: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const run = async (
    sessionStatus: string,
    participantStatus: string,
  ): Promise<string> => {
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', now() + interval '1 day', now() + interval '25 hours', $3, 'LIGHT', 1000)`,
      [sessionId, classId, sessionStatus],
    );
    const [enrollment] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM horse_enrollments WHERE horse_id = $1',
      [horse],
    );
    const [participant] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO session_participants (version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES (1, $1, $2, $3, $4, $5) RETURNING id`,
      [sessionId, horse, enrollment.id, participantStatus, helper],
    );
    return participant.id;
  };

  const statusOf = async (id: string) =>
    (
      await dataSource.query<{ status: string }[]>(
        'SELECT status FROM users WHERE id = $1',
        [id],
      )
    )[0].status;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    users = new UsersService(
      dataSource.getRepository(UserEntity),
      {
        setUserEnabled: jest.fn(),
        logoutUser: jest.fn(),
      } as unknown as KeycloakUserService,
      dataSource,
      new AuditService(),
      { disconnectUser: jest.fn() } as unknown as RealtimeGateway,
    );
    participants = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      dataSource,
      {} as MediaService,
      new AuditService(),
      new DomainEventPublisher(),
    );
  });

  afterAll(async () => {
    await stopTestPostgres(db);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const managerId = await seed.user(UserRole.CLUB_MANAGER);
    manager = await actorOf(managerId, UserRole.CLUB_MANAGER);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    caringGroom = await seed.user(UserRole.GROOM);
    helper = await seed.user(UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    horse = await seed.horse('Gió', { barnId: barn });
    ({ classId } = await seed.trainingClass(trainerId));
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now() - interval '1 day')`,
      [horse, caringGroom],
    );
    await dataSource.query(
      `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
       VALUES (1, $1, $2, 'ACTIVE', now() - interval '1 day')`,
      [classId, horse],
    );
  });

  it('refuses to lock a groom leading a future run of a horse they do not care for, then allows it once the head trainer reassigns the run', async () => {
    const participantId = await run('SCHEDULED', 'PLANNED');

    await expect(
      users.setStatus(manager, helper, UserStatus.LOCKED),
    ).rejects.toThrow(
      new ConflictException(
        'Người này còn 1 lượt tập được giao dắt chưa diễn ra, cần nhờ Huấn luyện viên trưởng giao lại trước khi khóa tài khoản',
      ),
    );
    expect(await statusOf(helper)).toBe(UserStatus.ACTIVE);

    await participants.assignGroom(trainer, participantId, {
      groomId: caringGroom,
    });
    await users.setStatus(manager, helper, UserStatus.LOCKED);

    expect(await statusOf(helper)).toBe(UserStatus.LOCKED);
  });

  it('refuses to change the role of a groom still leading a future run', async () => {
    await run('IN_PROGRESS', 'READY');

    await expect(
      users.update(manager, helper, { role: UserRole.HORSE_OWNER }),
    ).rejects.toThrow(ConflictException);
  });

  it('ignores runs that already ended or belong to a cancelled or completed session', async () => {
    await run('SCHEDULED', 'COMPLETED');
    await run('SCHEDULED', 'CANCELLED');
    await run('CANCELLED', 'PLANNED');
    await run('COMPLETED', 'PLANNED');

    await users.setStatus(manager, helper, UserStatus.LOCKED);

    expect(await statusOf(helper)).toBe(UserStatus.LOCKED);
  });
});

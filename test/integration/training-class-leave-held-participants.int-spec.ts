import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorsePlacementsRepository } from '../../src/modules/horses/horse-placements/horse-placements.repository';
import { HorsePlacementsService } from '../../src/modules/horses/horse-placements/horse-placements.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { BarnsService } from '../../src/modules/stable/barns/barns.service';
import { BarnEntity } from '../../src/modules/stable/entities/barn.entity';
import { StallAssignmentEntity } from '../../src/modules/stable/entities/stall-assignment.entity';
import { StallEntity } from '../../src/modules/stable/entities/stall.entity';
import { GroomAssignmentsService } from '../../src/modules/stable/groom-assignments/groom-assignments.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { StallsService } from '../../src/modules/stable/stalls/stalls.service';
import { HorseEnrollmentEntity } from '../../src/modules/training/entities/horse-enrollment.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const HOUR = 3_600_000;

describe('Rời lớp khi còn lượt bị khóa hoặc không đủ điều kiện (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let facade: TrainingOperationsFacade;
  let enrollments: TrainingClassEnrollmentsService;
  let placements: HorsePlacementsService;
  let manager: Actor;
  let trainerA: string;
  let trainerB: string;
  let barnB: string;
  let horseId: string;
  let enrollmentId: string;
  let start: Date;
  let locked: string;
  let ineligible: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const horseAccess = new HorseAccessService(dataSource);
    const stableAccess = new StableAccessService(horseAccess);
    const access = new TrainingAccessService(dataSource, horseAccess);
    const audit = new AuditService();
    facade = new TrainingOperationsFacade(
      new TrainingAccessService({} as DataSource, {} as HorseAccessService),
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      facade,
      dataSource,
      {} as MediaService,
      audit,
    );
    placements = new HorsePlacementsService(
      horseAccess,
      new BarnsService(
        dataSource.getRepository(BarnEntity),
        dataSource,
        stableAccess,
        audit,
        access,
      ),
      new StallsService(
        dataSource.getRepository(StallEntity),
        dataSource.getRepository(StallAssignmentEntity),
        dataSource,
        audit,
        stableAccess,
      ),
      new DomainEventPublisher(),
      dataSource,
      audit,
      facade,
      {} as GroomAssignmentsService,
      new HorsePlacementsRepository(dataSource),
    );
  });

  afterAll(() => stopTestPostgres(db));

  const barnOf = async (name: string, trainerId: string): Promise<string> => {
    const id = await seed.barn(name);
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, id],
    );
    await dataSource.query(
      `INSERT INTO stalls (id, version, barn_id, code) VALUES ($1, 1, $2, $3)`,
      [randomUUID(), id, `${name}-01`],
    );
    return id;
  };

  const session = async (classId: string, at: Date): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3, $4, 'SCHEDULED', 'LIGHT', 1200)`,
      [id, classId, at, new Date(at.getTime() + HOUR)],
    );
    return id;
  };

  const participant = async (
    sessionId: string,
    status: string,
    reason: string,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, ineligibility_reason)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [id, sessionId, horseId, enrollmentId, status, reason],
    );
    return id;
  };

  const statuses = async () => {
    const rows = await dataSource.query<Array<{ id: string; status: string }>>(
      'SELECT id, status FROM session_participants WHERE id = ANY($1)',
      [[locked, ineligible]],
    );
    const byId = new Map(rows.map((row) => [row.id, row.status]));
    return { locked: byId.get(locked), ineligible: byId.get(ineligible) };
  };

  const enrollInSameSlot = async (trainerId: string) => {
    const { classId } = await seed.trainingClass(trainerId, {
      code: 'Y',
      name: 'Lớp Y',
      startDate: '2020-01-01',
      endDate: '2099-12-31',
    });
    await session(classId, start);
    return enrollments
      .create(await actorOf(trainerId, UserRole.HEAD_TRAINER), classId, {
        horseId,
      })
      .then(
        () => null,
        (error: unknown) => (error as Error).message,
      );
  };

  const reevaluate = () =>
    dataSource.transaction((tx) =>
      facade.reevaluateUpcomingParticipants(tx, horseId),
    );

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    manager = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    trainerA = await seed.user(UserRole.HEAD_TRAINER);
    trainerB = await seed.user(UserRole.HEAD_TRAINER);
    const barnA = await barnOf('Khu A', trainerA);
    barnB = await barnOf('Khu B', trainerB);
    horseId = await seed.horse('Winx', { barnId: barnA });
    const { classId: classX } = await seed.trainingClass(trainerA, {
      code: 'X',
      name: 'Lớp X',
      startDate: '2020-01-01',
      endDate: '2099-12-31',
    });
    enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2020-01-01T00:00:00Z')`,
      [enrollmentId, classX, horseId],
    );
    start = new Date(Date.now() + 48 * HOUR);
    locked = await participant(
      await session(classX, start),
      'CANCELLED_BY_LOCK',
      'ACTIVE_TRAINING_LOCK',
    );
    ineligible = await participant(
      await session(classX, new Date(start.getTime() + 24 * HOUR)),
      'INELIGIBLE',
      'HEALTH_INJURED',
    );
  });

  it('leaving class X cancels its locked and ineligible future participants, frees the slot and reevaluation keeps them cancelled', async () => {
    await enrollments.leave(
      await actorOf(trainerA, UserRole.HEAD_TRAINER),
      enrollmentId,
      { reason: 'Rời lớp' },
    );

    expect(await statuses()).toEqual({
      locked: 'CANCELLED',
      ineligible: 'CANCELLED',
    });
    expect(await enrollInSameSlot(trainerA)).toBeNull();
    await reevaluate();
    expect(await statuses()).toEqual({
      locked: 'CANCELLED',
      ineligible: 'CANCELLED',
    });
  });

  it('changing barn withdraws class X, cancels its locked and ineligible future participants, frees the slot and reevaluation keeps them cancelled', async () => {
    await placements.assignBarn(manager, horseId, {
      barnId: barnB,
      reason: 'Cân bằng khu',
    });

    expect(await statuses()).toEqual({
      locked: 'CANCELLED',
      ineligible: 'CANCELLED',
    });
    expect(await enrollInSameSlot(trainerB)).toBeNull();
    await reevaluate();
    expect(await statuses()).toEqual({
      locked: 'CANCELLED',
      ineligible: 'CANCELLED',
    });
  });
});

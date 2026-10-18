import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { HorseEnrollmentEntity } from '../../src/modules/training/entities/horse-enrollment.entity';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { TrainingSessionsService } from '../../src/modules/training/training-sessions/training-sessions.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const CLASH_MESSAGE =
  'Người dắt bị trùng giờ: ngựa Gió ở buổi "Buổi mới" lúc 08:30 ngày 10/01/2030 trùng lượt ngựa Sấm ở buổi "Buổi" lúc 08:00 ngày 10/01/2030. Giao lại người dắt các lượt này trước';

describe('Grooms assigned automatically to training runs (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let sessions: TrainingSessionsService;
  let enrollments: TrainingClassEnrollmentsService;
  let trainer: Actor;
  let groomX: string;
  let groomY: string;
  let classA: string;
  let gio: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    sessions = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      access,
      dataSource,
      new AuditService(),
      new DomainEventPublisher(),
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      new TrainingOperationsFacade(access),
      dataSource,
      {
        signDownloadUrls: () => Promise.resolve(new Map()),
      } as unknown as MediaService,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  const enroll = async (classId: string, horseId: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-01-01T00:00:00Z')`,
      [id, classId, horseId],
    );
    return id;
  };

  const groomsOf = (classId: string) =>
    dataSource.query<Array<{ assigned_groom_id: string | null }>>(
      `SELECT p.assigned_groom_id FROM session_participants p
         JOIN training_sessions s ON s.id = p.session_id
        WHERE s.class_id = $1`,
      [classId],
    );

  const newSession = async (start: string, end: string) => ({
    subjectId: (
      await dataSource.query<Array<{ subject_id: string }>>(
        `SELECT s.subject_id FROM training_class_phase_subjects s
           JOIN training_class_phases p ON p.id = s.phase_id
          WHERE p.class_id = $1`,
        [classA],
      )
    )[0].subject_id,
    name: 'Buổi mới',
    sessionType: TrainingSessionType.REGULAR,
    intensity: TrainingIntensity.LIGHT,
    plannedDistanceM: 3000,
    scheduledStartAt: start,
    scheduledEndAt: end,
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [trainerId],
    );
    trainer = { sub: row.keycloak_id, roles: [UserRole.HEAD_TRAINER] };
    groomX = await seed.user(UserRole.GROOM);
    groomY = await seed.user(UserRole.GROOM);
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    const dates = { startDate: '2026-01-01', endDate: '2030-12-31' };
    ({ classId: classA } = await seed.trainingClass(trainerId, {
      ...dates,
      code: 'A',
    }));
    const { classId: classB } = await seed.trainingClass(trainerId, {
      ...dates,
      code: 'B',
    });
    gio = await seed.horse('Gió', { barnId });
    const sam = await seed.horse('Sấm', { barnId });
    for (const horseId of [gio, sam]) {
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, '2026-01-01T00:00:00Z')`,
        [horseId, groomX],
      );
    }
    const samEnrollment = await enroll(classB, sam);
    const sessionB = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z', 'SCHEDULED', 'LIGHT', 3000)`,
      [sessionB, classB],
    );
    await dataSource.query(
      `INSERT INTO session_participants (version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES (1, $1, $2, $3, 'PLANNED', $4)`,
      [sessionB, sam, samEnrollment, groomX],
    );
  });

  it('refuses adding a session whose run would give the groom a clashing run, saving nothing', async () => {
    await enroll(classA, gio);

    await expect(
      sessions.createSession(
        trainer,
        classA,
        await newSession('2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z'),
      ),
    ).rejects.toThrow(new ConflictException(CLASH_MESSAGE));
    expect(
      await dataSource.query(
        'SELECT id FROM training_sessions WHERE class_id = $1',
        [classA],
      ),
    ).toEqual([]);
  });

  it('adds a session that only touches the other run, giving its run to the groom in charge', async () => {
    await enroll(classA, gio);

    await sessions.createSession(
      trainer,
      classA,
      await newSession('2030-01-10T02:00:00Z', '2030-01-10T03:00:00Z'),
    );

    expect(await groomsOf(classA)).toEqual([{ assigned_groom_id: groomX }]);
  });

  it('keeps a groom the head trainer picked when the session is edited', async () => {
    await enroll(classA, gio);
    const created = await sessions.createSession(
      trainer,
      classA,
      await newSession('2030-01-10T05:00:00Z', '2030-01-10T06:00:00Z'),
    );
    await dataSource.query(
      'UPDATE session_participants SET assigned_groom_id = $1 WHERE session_id = $2',
      [groomY, created.id],
    );

    await sessions.updateSession(trainer, created.id, {
      intensity: TrainingIntensity.HEAVY,
    });

    expect(await groomsOf(classA)).toEqual([{ assigned_groom_id: groomY }]);
  });

  it('refuses moving a session onto a time its groom is busy, keeping the old time', async () => {
    await enroll(classA, gio);
    const created = await sessions.createSession(
      trainer,
      classA,
      await newSession('2030-01-10T05:00:00Z', '2030-01-10T06:00:00Z'),
    );

    await expect(
      sessions.updateSession(trainer, created.id, {
        scheduledStartAt: '2030-01-10T01:30:00Z',
        scheduledEndAt: '2030-01-10T02:30:00Z',
      }),
    ).rejects.toThrow(new ConflictException(CLASH_MESSAGE));
    const [row] = await dataSource.query<Array<{ scheduled_start_at: Date }>>(
      'SELECT scheduled_start_at FROM training_sessions WHERE id = $1',
      [created.id],
    );
    expect(row.scheduled_start_at.toISOString()).toBe(
      '2030-01-10T05:00:00.000Z',
    );
  });

  it('refuses enrolling a horse whose groom is busy at one of the class sessions, saving nothing', async () => {
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi mới', '2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z', 'SCHEDULED', 'LIGHT', 3000)`,
      [randomUUID(), classA],
    );

    await expect(
      enrollments.create(trainer, classA, { horseId: gio }),
    ).rejects.toThrow(new ConflictException(CLASH_MESSAGE));
    expect(
      await dataSource.query(
        'SELECT id FROM horse_enrollments WHERE class_id = $1',
        [classA],
      ),
    ).toEqual([]);
  });
});

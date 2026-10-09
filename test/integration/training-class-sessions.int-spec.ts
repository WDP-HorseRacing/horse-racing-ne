import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { HorseEnrollmentEntity } from '../../src/modules/training/entities/horse-enrollment.entity';
import { TrainingClassEntity } from '../../src/modules/training/entities/training-class.entity';
import { TrainingClassStatus } from '../../src/modules/training/enums/training-class-status.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { TrainingClassesService } from '../../src/modules/training/training-classes/services/training-classes.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Training class queries over its sessions (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let access: TrainingAccessService;
  let classes: TrainingClassesService;
  let enrollments: TrainingClassEnrollmentsService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    classes = new TrainingClassesService(
      dataSource.getRepository(TrainingClassEntity),
      access,
      dataSource,
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      new TrainingOperationsFacade(),
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
  });

  async function actorOf(role: UserRole, id?: string): Promise<Actor> {
    const userId = id ?? (await seed.user(role));
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  }

  async function seedClass(code: string) {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const barnId = await seed.barn(`Khu ${code}`);
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    const created = await seed.trainingClass(trainerId, {
      code,
      startDate: '2026-01-01',
      endDate: '2099-12-31',
    });
    return {
      ...created,
      barnId,
      trainer: await actorOf(UserRole.HEAD_TRAINER, trainerId),
    };
  }

  async function seedSession(
    owner: { classId: string },
    status: string,
    startAt = '2099-06-01T01:00:00Z',
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3::timestamptz, $3::timestamptz + interval '1 hour', $4, 'MODERATE', 3000)`,
      [id, owner.classId, startAt, status],
    );
    return id;
  }

  async function seedParticipant(
    owner: { classId: string },
    sessionId: string,
    status: string,
    groomId: string | null = null,
  ): Promise<string> {
    const horse = await seed.horse(`Ngựa ${randomUUID().slice(0, 6)}`);
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-01-02T00:00:00Z')`,
      [enrollmentId, owner.classId, horse],
    );
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [id, sessionId, horse, enrollmentId, status, groomId],
    );
    return id;
  }

  const statusOf = async (table: string, id: string): Promise<string> => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      `SELECT status FROM ${table} WHERE id = $1`,
      [id],
    );
    return row.status;
  };

  it('cancels only the open sessions and participants of the cancelled class', async () => {
    const a = await seedClass('A');
    const b = await seedClass('B');
    const sessionA = await seedSession(a, 'SCHEDULED');
    const participantA = await seedParticipant(a, sessionA, 'PLANNED');
    const sessionB = await seedSession(b, 'SCHEDULED');
    const participantB = await seedParticipant(b, sessionB, 'PLANNED');

    await classes.updateStatus(a.trainer, a.classId, {
      status: TrainingClassStatus.CANCELLED,
      cancelReason: 'Thôi',
    });

    expect(await statusOf('training_sessions', sessionA)).toBe('CANCELLED');
    expect(await statusOf('session_participants', participantA)).toBe(
      'CANCELLED',
    );
    expect(await statusOf('training_sessions', sessionB)).toBe('SCHEDULED');
    expect(await statusOf('session_participants', participantB)).toBe(
      'PLANNED',
    );
  });

  it('refuses to cancel a class with an ongoing participant', async () => {
    const a = await seedClass('A');
    const session = await seedSession(a, 'IN_PROGRESS');
    await seedParticipant(a, session, 'ONGOING');

    await expect(
      classes.updateStatus(a.trainer, a.classId, {
        status: TrainingClassStatus.CANCELLED,
        cancelReason: 'Thôi',
      }),
    ).rejects.toThrow(
      new ConflictException('Không thể hủy lớp khi còn lượt tập đang tập'),
    );
  });

  it('blocks completing a class only by its own unfinished sessions', async () => {
    const a = await seedClass('A');
    const b = await seedClass('B');
    await seedSession(b, 'DRAFT');

    await expect(
      classes.updateStatus(a.trainer, a.classId, {
        status: TrainingClassStatus.COMPLETED,
      }),
    ).resolves.toMatchObject({ status: TrainingClassStatus.COMPLETED });

    await expect(
      classes.updateStatus(b.trainer, b.classId, {
        status: TrainingClassStatus.COMPLETED,
      }),
    ).rejects.toThrow(
      new ConflictException('Lớp vẫn còn buổi tập chưa kết thúc'),
    );
  });

  it('adds a newly enrolled horse only to future scheduled sessions of its class', async () => {
    const a = await seedClass('A');
    const b = await seedClass('B');
    const futureA = await seedSession(a, 'SCHEDULED');
    await seedSession(a, 'DRAFT');
    await seedSession(b, 'SCHEDULED');
    const horse = await seed.horse('Winx', { barnId: a.barnId });

    await enrollments.create(a.trainer, a.classId, {
      horseId: horse,
      enrolledAt: '2026-06-01T00:00:00Z',
    });

    const rows = await dataSource.query<Array<{ session_id: string }>>(
      'SELECT session_id FROM session_participants WHERE horse_id = $1',
      [horse],
    );
    expect(rows.map((row) => row.session_id)).toEqual([futureA]);
  });

  it('lets a groom read only the classes where they lead a participant', async () => {
    const a = await seedClass('A');
    const b = await seedClass('B');
    const groomId = await seed.user(UserRole.GROOM);
    const groom = await actorOf(UserRole.GROOM, groomId);
    const sessionA = await seedSession(a, 'SCHEDULED');
    await seedParticipant(a, sessionA, 'PLANNED', groomId);

    await expect(
      access.assertCanReadClass(groom, a.classId),
    ).resolves.toBeTruthy();
    await expect(access.assertCanReadClass(groom, b.classId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a new start date only when the recomputed range leaves out a session of that class', async () => {
    const a = await seedClass('A');
    const b = await seedClass('B');
    await dataSource.query(
      `UPDATE training_classes SET status = 'DRAFT' WHERE id IN ($1, $2)`,
      [a.classId, b.classId],
    );
    await seedSession(b, 'DRAFT', '2026-03-10T01:00:00Z');
    await seedSession(a, 'DRAFT', '2026-12-01T01:00:00Z');

    await expect(
      classes.update(b.trainer, b.classId, { startDate: '2026-03-02' }),
    ).resolves.toMatchObject({
      startDate: '2026-03-02',
      endDate: '2026-03-29',
    });
    await expect(
      classes.update(a.trainer, a.classId, { startDate: '2026-03-02' }),
    ).rejects.toThrow(
      new ConflictException(
        'Khoảng ngày mới không bao phủ các buổi tập hiện có',
      ),
    );
  });
});

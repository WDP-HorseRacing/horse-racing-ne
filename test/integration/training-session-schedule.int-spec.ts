import { ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { HorseHealthStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingSessionsService } from '../../src/modules/training/training-sessions/training-sessions.service';
import { TrainingNoDrafts1789827100000 } from '../../src/migrations/1789827100000-TrainingNoDrafts';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';
import { AuditService } from '../../src/modules/audit/services/audit.service';

describe('Saving training sessions schedules the horses (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: TrainingSessionsService;
  let trainer: Actor;
  let classId: string;
  let barnId: string;
  let subjectId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      dataSource,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      weeks: 13,
    }));
    [{ subject_id: subjectId }] = await dataSource.query<
      Array<{ subject_id: string }>
    >(
      `SELECT s.subject_id FROM training_class_phase_subjects s
         JOIN training_class_phases p ON p.id = s.phase_id
        WHERE p.class_id = $1`,
      [classId],
    );
  });

  const enroll = async (
    name: string,
    health = HorseHealthStatus.ELIGIBLE,
    leftAt: string | null = null,
  ): Promise<string> => {
    const horse = await seed.horse(name, { barnId, health });
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at, left_at)
       VALUES ($1, 1, $2, $3, $4, '2026-10-01T00:00:00Z', $5)`,
      [randomUUID(), classId, horse, leftAt ? 'LEFT' : 'ACTIVE', leftAt],
    );
    return horse;
  };

  const create = (
    startAt: string,
    intensity = TrainingIntensity.MODERATE,
    actor = trainer,
  ) =>
    service.createSession(actor, classId, {
      name: 'Buổi',
      subjectId,
      intensity,
      plannedDistanceM: 3000,
      scheduledStartAt: startAt,
      scheduledEndAt: new Date(
        new Date(startAt).getTime() + 3_600_000,
      ).toISOString(),
    });

  const participantsOf = (sessionId: string) =>
    dataSource.query<
      Array<{ horse_id: string; status: string; cancel_reason: string | null }>
    >(
      'SELECT horse_id, status, cancel_reason FROM session_participants WHERE session_id = $1 ORDER BY horse_id',
      [sessionId],
    );

  const statusByHorse = async (sessionId: string) =>
    Object.fromEntries(
      (await participantsOf(sessionId)).map((r) => [r.horse_id, r.status]),
    );

  it('schedules a new session and plans every enrolled horse with its eligibility', async () => {
    const healthy = await enroll('Winx');
    const watched = await enroll('Gió', HorseHealthStatus.UNDER_OBSERVATION);

    const created = await create(
      '2026-11-10T01:00:00Z',
      TrainingIntensity.HEAVY,
    );

    expect(created.status).toBe('SCHEDULED');
    await expect(statusByHorse(created.id)).resolves.toEqual({
      [healthy]: 'PLANNED',
      [watched]: 'INELIGIBLE',
    });
    const [audit] = await dataSource.query<
      Array<{ after_data: Record<string, unknown> }>
    >('SELECT after_data FROM audit_logs WHERE entity_id = $1', [created.id]);
    expect(audit.after_data).toMatchObject({
      status: 'SCHEDULED',
      participantsCreated: 2,
    });
  });

  it('re-checks eligibility when the intensity changes', async () => {
    const watched = await enroll('Gió', HorseHealthStatus.UNDER_OBSERVATION);
    const created = await create('2026-11-10T01:00:00Z');
    expect(await statusByHorse(created.id)).toEqual({ [watched]: 'PLANNED' });

    await service.updateSession(trainer, created.id, {
      intensity: TrainingIntensity.HEAVY,
    });

    expect(await statusByHorse(created.id)).toEqual({
      [watched]: 'INELIGIBLE',
    });
  });

  it('cancels the run of a horse that no longer studies the class at the new time, and brings it back when moved back', async () => {
    const leaving = await enroll(
      'Winx',
      HorseHealthStatus.ELIGIBLE,
      '2026-11-15T00:00:00Z',
    );
    const created = await create('2026-11-10T01:00:00Z');

    await service.updateSession(trainer, created.id, {
      scheduledStartAt: '2026-11-20T01:00:00Z',
      scheduledEndAt: '2026-11-20T02:00:00Z',
    });
    await expect(participantsOf(created.id)).resolves.toEqual([
      {
        horse_id: leaving,
        status: 'CANCELLED',
        cancel_reason: 'Ngựa không học lớp vào giờ mới của buổi',
      },
    ]);

    await service.updateSession(trainer, created.id, {
      scheduledStartAt: '2026-11-11T01:00:00Z',
      scheduledEndAt: '2026-11-11T02:00:00Z',
    });
    await expect(participantsOf(created.id)).resolves.toEqual([
      { horse_id: leaving, status: 'PLANNED', cancel_reason: null },
    ]);
  });

  it('refuses editing once a horse has checked in', async () => {
    await enroll('Winx');
    const created = await create('2026-11-10T01:00:00Z');
    await dataSource.query(
      `UPDATE session_participants SET status = 'PRESENT' WHERE session_id = $1`,
      [created.id],
    );

    await expect(
      service.updateSession(trainer, created.id, { name: 'Đổi' }),
    ).rejects.toThrow(
      new ConflictException('Buổi tập đã có ngựa điểm danh, không sửa được'),
    );
  });

  it('refuses editing a session that has started', async () => {
    const created = await create('2026-11-10T01:00:00Z');
    await dataSource.query(
      `UPDATE training_sessions SET scheduled_start_at = now() - interval '1 minute' WHERE id = $1`,
      [created.id],
    );

    await expect(
      service.updateSession(trainer, created.id, { name: 'Đổi' }),
    ).rejects.toThrow(
      new ConflictException(
        'Chỉ sửa được buổi tập đã lên lịch và chưa tới giờ bắt đầu',
      ),
    );
  });

  it('forbids another head trainer from adding or editing sessions', async () => {
    const created = await create('2026-11-10T01:00:00Z');
    const other = await actorOf(
      await seed.user(UserRole.HEAD_TRAINER),
      UserRole.HEAD_TRAINER,
    );

    await expect(
      create('2026-11-12T01:00:00Z', TrainingIntensity.LIGHT, other),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.updateSession(other, created.id, { name: 'Đổi' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('migrates draft classes and sessions, planning the enrolled horses with their groom', async () => {
    const horse = await enroll('Winx');
    const groomId = await seed.user(UserRole.GROOM);
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, '2026-09-01T00:00:00Z')`,
      [horse, groomId],
    );
    await dataSource.query(
      `UPDATE training_classes SET status = 'DRAFT' WHERE id = $1`,
      [classId],
    );
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Nháp', '2026-11-10T01:00:00Z', '2026-11-10T02:00:00Z', 'DRAFT', 'LIGHT', 2000)`,
      [sessionId, classId],
    );

    const runner = dataSource.createQueryRunner();
    try {
      await new TrainingNoDrafts1789827100000().up(runner);
    } finally {
      await runner.release();
    }

    await expect(
      dataSource.query(
        `SELECT c.status AS class_status, s.status AS session_status
           FROM training_sessions s JOIN training_classes c ON c.id = s.class_id
          WHERE s.id = $1`,
        [sessionId],
      ),
    ).resolves.toEqual([
      { class_status: 'ACTIVE', session_status: 'SCHEDULED' },
    ]);
    await expect(
      dataSource.query(
        'SELECT horse_id, status, assigned_groom_id FROM session_participants WHERE session_id = $1',
        [sessionId],
      ),
    ).resolves.toEqual([
      { horse_id: horse, status: 'PLANNED', assigned_groom_id: groomId },
    ]);
  });

  describe('several sessions at once', () => {
    const at = (start: string) => ({
      name: 'Buổi',
      subjectId,
      intensity: TrainingIntensity.LIGHT,
      plannedDistanceM: 2000,
      scheduledStartAt: start,
      scheduledEndAt: new Date(Date.parse(start) + 3_600_000).toISOString(),
    });

    it('saves every session in time order and plans the enrolled horses', async () => {
      const horse = await enroll('Winx');

      const rows = await service.createSessions(trainer, classId, {
        sessions: [at('2026-11-17T01:00:00Z'), at('2026-11-10T01:00:00Z')],
      });

      expect(rows.map((row) => row.scheduledStartAt.toISOString())).toEqual([
        '2026-11-10T01:00:00.000Z',
        '2026-11-17T01:00:00.000Z',
      ]);
      for (const row of rows) {
        expect(await statusByHorse(row.id)).toEqual({ [horse]: 'PLANNED' });
      }
    });

    it('saves nothing and names the failing session when two of them overlap', async () => {
      await expect(
        service.createSessions(trainer, classId, {
          sessions: [at('2026-11-10T01:00:00Z'), at('2026-11-10T01:30:00Z')],
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          message:
            'Buổi 2: Trùng giờ với buổi tập lúc 08:00 ngày 10/11/2026 của lớp',
          errors: [{ field: 'sessions.1' }],
        },
      });
      const [{ count }] = await dataSource.query<Array<{ count: string }>>(
        'SELECT count(*) FROM training_sessions WHERE class_id = $1',
        [classId],
      );
      expect(count).toBe('0');
    });
  });

  describe('subjects of the class phases', () => {
    let sprint: string;

    beforeEach(async () => {
      sprint = randomUUID();
      await dataSource.query(
        `INSERT INTO training_subjects (id, version, name, session_type, intensity, planned_distance_m)
         VALUES ($1, 1, 'Nước rút', 'REGULAR', 'HEAVY', 1200)`,
        [sprint],
      );
      await dataSource.query(
        'UPDATE training_class_phases SET weeks = 4 WHERE class_id = $1',
        [classId],
      );
      const phaseId = randomUUID();
      await dataSource.query(
        `INSERT INTO training_class_phases (id, class_id, position, weeks) VALUES ($1, $2, 2, 9)`,
        [phaseId, classId],
      );
      await dataSource.query(
        `INSERT INTO training_class_phase_subjects (phase_id, subject_id, min_sessions_per_week) VALUES ($1, $2, 2)`,
        [phaseId, sprint],
      );
    });

    const withSubject = (id: string, start: string) => ({
      name: 'Buổi',
      subjectId: id,
      intensity: TrainingIntensity.HEAVY,
      plannedDistanceM: 1200,
      scheduledStartAt: start,
      scheduledEndAt: new Date(Date.parse(start) + 3_600_000).toISOString(),
    });

    it('accepts a subject only inside its phase, by club day', async () => {
      await expect(
        service.createSession(
          trainer,
          classId,
          withSubject(sprint, '2026-10-28T16:00:00Z'),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Môn Nước rút không có trong giai đoạn 1 của lớp',
        ),
      );
      await expect(
        service.createSession(
          trainer,
          classId,
          withSubject(sprint, '2026-10-28T17:00:00Z'),
        ),
      ).resolves.toMatchObject({ subjectId: sprint });
    });

    it('refuses moving a session into a phase without its subject', async () => {
      const created = await service.createSession(
        trainer,
        classId,
        withSubject(subjectId, '2026-10-20T01:00:00Z'),
      );

      await expect(
        service.updateSession(trainer, created.id, {
          scheduledStartAt: '2026-11-20T01:00:00Z',
          scheduledEndAt: '2026-11-20T02:00:00Z',
        }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.updateSession(trainer, created.id, { subjectId: sprint }),
      ).rejects.toThrow(
        new ConflictException(
          'Môn Nước rút không có trong giai đoạn 1 của lớp',
        ),
      );
    });
  });
});

import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingSessionsService } from '../../src/modules/training/training-sessions/training-sessions.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Overlapping sessions of a head trainer across classes (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let sessions: TrainingSessionsService;
  let trainerId: string;
  let trainer: Actor;
  let classA: string;
  let classB: string;

  const dates = { startDate: '2026-01-01', endDate: '2099-12-31' };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    sessions = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      dataSource,
      new AuditService(),
      new DomainEventPublisher(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [trainerId],
    );
    trainer = { sub: row.keycloak_id, roles: [UserRole.HEAD_TRAINER] };
    ({ classId: classA } = await seed.trainingClass(trainerId, {
      ...dates,
      code: 'A',
    }));
    ({ classId: classB } = await seed.trainingClass(trainerId, {
      ...dates,
      code: 'B',
    }));
  });

  const session = async (
    classId: string,
    start: string,
    end: string,
    status = 'SCHEDULED',
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3, $4, $5, 'LIGHT', 3000)`,
      [id, classId, start, end, status],
    );
    return id;
  };

  const newSession = async (classId: string, start: string, end: string) => ({
    subjectId: (
      await dataSource.query<Array<{ subject_id: string }>>(
        `SELECT s.subject_id FROM training_class_phase_subjects s
           JOIN training_class_phases p ON p.id = s.phase_id
          WHERE p.class_id = $1`,
        [classId],
      )
    )[0].subject_id,
    name: 'Buổi mới',
    sessionType: TrainingSessionType.REGULAR,
    intensity: TrainingIntensity.LIGHT,
    plannedDistanceM: 3000,
    scheduledStartAt: start,
    scheduledEndAt: end,
  });

  const sessionCount = async (classId: string) =>
    Number(
      (
        await dataSource.query<Array<{ count: string }>>(
          'SELECT COUNT(*) FROM training_sessions WHERE class_id = $1',
          [classId],
        )
      )[0].count,
    );

  it('refuses a session overlapping a session of another class of the same head trainer', async () => {
    await session(classA, '2099-01-10T01:00:00Z', '2099-01-10T02:00:00Z');

    await expect(
      sessions.createSession(
        trainer,
        classB,
        await newSession(
          classB,
          '2099-01-10T01:30:00Z',
          '2099-01-10T02:30:00Z',
        ),
      ),
    ).rejects.toThrow(
      new ConflictException(
        'Trùng giờ với lịch của Huấn luyện viên trưởng: lớp A, 08:00 ngày 10/01/2099',
      ),
    );
    expect(await sessionCount(classB)).toBe(0);
  });

  it('refuses the whole batch when one session overlaps another class of the head trainer', async () => {
    await session(classA, '2099-01-17T01:00:00Z', '2099-01-17T02:00:00Z');

    await expect(
      sessions.createSessions(trainer, classB, {
        sessions: [
          await newSession(
            classB,
            '2099-01-10T01:00:00Z',
            '2099-01-10T02:00:00Z',
          ),
          await newSession(
            classB,
            '2099-01-17T01:30:00Z',
            '2099-01-17T02:30:00Z',
          ),
        ],
      }),
    ).rejects.toThrow(
      'Buổi 2: Trùng giờ với lịch của Huấn luyện viên trưởng: lớp A, 08:00 ngày 17/01/2099',
    );
    expect(await sessionCount(classB)).toBe(0);
  });

  it('refuses moving a session onto a session of another class of the head trainer and keeps its time', async () => {
    await session(classA, '2099-01-10T01:00:00Z', '2099-01-10T02:00:00Z');
    const moved = await session(
      classB,
      '2099-01-11T01:00:00Z',
      '2099-01-11T02:00:00Z',
    );

    await expect(
      sessions.updateSession(trainer, moved, {
        scheduledStartAt: '2099-01-10T01:45:00Z',
        scheduledEndAt: '2099-01-10T02:45:00Z',
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Trùng giờ với lịch của Huấn luyện viên trưởng: lớp A, 08:00 ngày 10/01/2099',
      ),
    );
    const [row] = await dataSource.query<Array<{ scheduled_start_at: Date }>>(
      'SELECT scheduled_start_at FROM training_sessions WHERE id = $1',
      [moved],
    );
    expect(row.scheduled_start_at.toISOString()).toBe(
      '2099-01-11T01:00:00.000Z',
    );
  });

  it('ignores a cancelled session and a session touching only at the edge', async () => {
    await session(
      classA,
      '2099-01-10T01:00:00Z',
      '2099-01-10T02:00:00Z',
      'CANCELLED',
    );
    await session(classA, '2099-01-10T02:00:00Z', '2099-01-10T03:00:00Z');

    const created = await sessions.createSession(
      trainer,
      classB,
      await newSession(classB, '2099-01-10T01:00:00Z', '2099-01-10T02:00:00Z'),
    );

    expect(created.status).toBe('SCHEDULED');
  });

  it('ignores sessions of classes led by another head trainer or by nobody', async () => {
    const other = await seed.trainingClass(
      await seed.user(UserRole.HEAD_TRAINER),
      { ...dates, code: 'C' },
    );
    const orphan = await seed.trainingClass(trainerId, { ...dates, code: 'D' });
    await dataSource.query(
      'UPDATE training_classes SET head_trainer_id = NULL WHERE id = $1',
      [orphan.classId],
    );
    await session(
      other.classId,
      '2099-01-10T01:00:00Z',
      '2099-01-10T02:00:00Z',
    );
    await session(
      orphan.classId,
      '2099-01-10T01:00:00Z',
      '2099-01-10T02:00:00Z',
    );

    const created = await sessions.createSession(
      trainer,
      classB,
      await newSession(classB, '2099-01-10T01:00:00Z', '2099-01-10T02:00:00Z'),
    );

    expect(created.status).toBe('SCHEDULED');
  });
});

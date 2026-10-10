import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { ClassSessionInputDto } from '../../src/modules/training/dto/class-schedule.dto';
import { TrainingClassEntity } from '../../src/modules/training/entities/training-class.entity';
import { TrainingPlanEntity } from '../../src/modules/training/entities/training-plan.entity';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingClassStatus } from '../../src/modules/training/enums/training-class-status.enum';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingClassesService } from '../../src/modules/training/training-classes/services/training-classes.service';
import { TrainingPlansService } from '../../src/modules/training/training-plans/training-plans.service';
import { TrainingSubjectsService } from '../../src/modules/training/training-subjects/training-subjects.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Creating a class with its sessions (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let plans: TrainingPlansService;
  let classes: TrainingClassesService;
  let subjects: TrainingSubjectsService;
  let trainer: Actor;
  let trainerId: string;
  let regular: string;
  let trial: string;
  let planId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    plans = new TrainingPlansService(
      dataSource.getRepository(TrainingPlanEntity),
      access,
      dataSource,
    );
    classes = new TrainingClassesService(
      dataSource.getRepository(TrainingClassEntity),
      access,
      dataSource,
    );
    subjects = new TrainingSubjectsService(
      dataSource.getRepository(TrainingSubjectEntity),
      access,
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  async function actorOf(role: UserRole, id?: string): Promise<Actor> {
    const userId = id ?? (await seed.user(role));
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  }

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const manager = await actorOf(UserRole.CLUB_MANAGER);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(UserRole.HEAD_TRAINER, trainerId);
    regular = (
      await subjects.create(manager, {
        name: 'Sức bền',
        sessionType: TrainingSessionType.REGULAR,
        intensity: TrainingIntensity.MODERATE,
        plannedDistanceM: 3000,
      })
    ).id;
    trial = (
      await subjects.create(manager, {
        name: 'Chạy thử 1200',
        sessionType: TrainingSessionType.TIME_TRIAL,
        intensity: TrainingIntensity.HEAVY,
        plannedDistanceM: 1200,
        targetTimeMs: 75000,
      })
    ).id;
    planId = (
      await plans.create(trainer, {
        name: 'Giáo án dài',
        phases: [
          {
            weeks: 22,
            subjects: [{ subjectId: regular, weekdays: [1, 3, 5] }],
          },
        ],
      })
    ).id;
  });

  async function count(table: string): Promise<number> {
    const [row] = await dataSource.query<Array<{ count: string }>>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
  }

  async function insertsDuring(
    run: () => Promise<unknown>,
  ): Promise<Record<string, number>> {
    const spy = jest.spyOn(PostgresQueryRunner.prototype, 'query');
    try {
      await run();
      const counts: Record<string, number> = {};
      for (const [sql] of spy.mock.calls) {
        const table = /^\s*INSERT INTO "(\w+)"/.exec(sql)?.[1];
        if (table) counts[table] = (counts[table] ?? 0) + 1;
      }
      return counts;
    } finally {
      spy.mockRestore();
    }
  }

  const session = (
    k: number,
    overrides: Partial<ClassSessionInputDto> = {},
  ): ClassSessionInputDto => {
    const day = new Date(Date.UTC(2027, 0, 4 + Math.floor(k / 2)));
    const hour = k % 2 === 0 ? 1 : 3;
    const at = (h: number) =>
      new Date(day.getTime() + h * 3_600_000).toISOString();
    const isTrial = k % 10 === 9;
    return {
      subjectId: isTrial ? trial : regular,
      name: `Buổi ${k}`,
      intensity: isTrial ? TrainingIntensity.HEAVY : TrainingIntensity.LIGHT,
      plannedDistanceM: isTrial ? 1200 : 2000 + k,
      surface: k % 3 === 0 ? undefined : 'Cỏ',
      location: k % 4 === 0 ? undefined : `Sân ${k % 4}`,
      notes: k % 5 === 0 ? undefined : `Ghi chú ${k}`,
      targetTimeMs: isTrial ? (k % 20 === 19 ? null : 70000 + k) : undefined,
      scheduledStartAt: at(hour),
      scheduledEndAt: at(hour + 1),
      ...overrides,
    };
  };

  const createClass = (sessionInputs: ClassSessionInputDto[]) =>
    classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId,
      startDate: '2027-01-04',
      sessions: sessionInputs,
    });

  it('saves nothing when one session of the body overlaps another one', async () => {
    await expect(
      createClass([
        session(0),
        session(1),
        session(2, {
          scheduledStartAt: '2027-01-04T01:30:00.000Z',
          scheduledEndAt: '2027-01-04T02:30:00.000Z',
        }),
      ]),
    ).rejects.toThrow(
      new ConflictException(
        'Trùng giờ với buổi tập lúc 08:00 ngày 04/01/2027 của lớp',
      ),
    );

    expect(await count('training_classes')).toBe(0);
    expect(await count('training_sessions')).toBe(0);
    expect(await count('time_trials')).toBe(0);
  });

  it('saves 300 sessions and their time trial configs in a few batched inserts', async () => {
    const inputs = Array.from({ length: 300 }, (_, k) => session(k));

    let classId = '';
    const inserts = await insertsDuring(async () => {
      classId = (await createClass(inputs)).id;
    });

    const rows = await dataSource.query<Array<Record<string, unknown>>>(
      `SELECT s.subject_id, s.name, s.session_type, s.intensity, s.planned_distance_m,
              s.scheduled_start_at, s.scheduled_end_at, s.location, s.surface, s.notes, s.status,
              t.distance_m, t.target_time_ms, t.notes AS trial_notes
         FROM training_sessions s
         LEFT JOIN time_trials t ON t.session_id = s.id
        WHERE s.class_id = $1
        ORDER BY s.scheduled_start_at`,
      [classId],
    );
    expect(rows).toEqual(
      inputs.map((input) => {
        const isTrial = input.subjectId === trial;
        return {
          subject_id: input.subjectId,
          name: input.name,
          session_type: isTrial ? 'TIME_TRIAL' : 'REGULAR',
          intensity: input.intensity,
          planned_distance_m: input.plannedDistanceM,
          scheduled_start_at: new Date(input.scheduledStartAt),
          scheduled_end_at: new Date(input.scheduledEndAt),
          location: input.location ?? null,
          surface: input.surface ?? null,
          notes: input.notes ?? null,
          status: 'DRAFT',
          distance_m: isTrial ? '1200.00' : null,
          target_time_ms:
            isTrial && input.targetTimeMs != null
              ? String(input.targetTimeMs)
              : null,
          trial_notes: null,
        };
      }),
    );
    expect(await count('time_trials')).toBe(30);
    expect(inserts).toEqual({
      training_classes: 1,
      training_sessions: 3,
      time_trials: 1,
    });
  });

  it('marks the open sessions of a cancelled class with the class cancel reason', async () => {
    const created = await createClass([session(0)]);

    await classes.updateStatus(trainer, created.id, {
      status: TrainingClassStatus.CANCELLED,
      cancelReason: 'Thôi',
    });

    await expect(
      dataSource.query(
        'SELECT status, cancel_reason FROM training_sessions WHERE class_id = $1',
        [created.id],
      ),
    ).resolves.toEqual([
      { status: 'CANCELLED', cancel_reason: 'Lớp bị hủy: Thôi' },
    ]);
  });

  describe('a null target time means no target', () => {
    it('creates the class time trial config without a target', async () => {
      const created = await createClass([session(9, { targetTimeMs: null })]);

      const [row] = await dataSource.query<
        Array<{ target_time_ms: string | null }>
      >(
        `SELECT t.target_time_ms FROM time_trials t
           JOIN training_sessions s ON s.id = t.session_id
          WHERE s.class_id = $1`,
        [created.id],
      );
      expect(row).toEqual({ target_time_ms: null });
    });
  });
});

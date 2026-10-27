import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { BarnsService } from '../../src/modules/stable/barns/barns.service';
import { BarnEntity } from '../../src/modules/stable/entities/barn.entity';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { AUTO_COMPLETED_CLASS_REASON } from '../../src/modules/training/constants/participant-window.constants';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { SessionAutoCloseService } from '../../src/modules/training/training-sessions/session-auto-close.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const TODAY = '2026-10-19';

describe('SessionAutoCloseService.completeEndedClasses (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let job: SessionAutoCloseService;
  let barns: BarnsService;
  let headTrainerId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const horseAccess = new HorseAccessService(dataSource);
    const access = new TrainingAccessService(dataSource, horseAccess);
    job = new SessionAutoCloseService(
      dataSource,
      new TrainingOperationsFacade(access),
      new AuditService(),
    );
    barns = new BarnsService(
      dataSource.getRepository(BarnEntity),
      dataSource,
      new StableAccessService(horseAccess),
      new AuditService(),
      access,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    headTrainerId = await seed.user(UserRole.HEAD_TRAINER);
  });

  const endedClass = (endDate = '2026-10-18', status = 'ACTIVE') =>
    seed.trainingClass(headTrainerId, {
      status,
      startDate: '2026-09-01',
      endDate,
    });

  const enroll = async (classId: string, horseId: string): Promise<void> => {
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, enrolled_at, status)
       VALUES (gen_random_uuid(), 1, $1, $2, now(), 'ACTIVE')`,
      [classId, horseId],
    );
  };

  const addSession = async (classId: string, status: string): Promise<void> => {
    await dataSource.query(
      `INSERT INTO training_sessions (version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES (1, $1, 'Buổi', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z', $2, 'LIGHT', 3000)`,
      [classId, status],
    );
  };

  const classStatus = async (classId: string): Promise<string> => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM training_classes WHERE id = $1',
      [classId],
    );
    return row.status;
  };

  it('completes an ended class without open sessions, lets its horses leave and records a system audit', async () => {
    const { classId } = await endedClass();
    await enroll(classId, await seed.horse('Ngựa 1'));
    await addSession(classId, 'COMPLETED');

    await expect(job.completeEndedClasses(TODAY)).resolves.toBe(1);

    const [row] = await dataSource.query<
      Array<{ status: string; completed_at: Date | null }>
    >('SELECT status, completed_at FROM training_classes WHERE id = $1', [
      classId,
    ]);
    expect(row.status).toBe('COMPLETED');
    expect(row.completed_at).not.toBeNull();
    const enrollments = await dataSource.query<
      Array<{ status: string; left_at: Date | null }>
    >('SELECT status, left_at FROM horse_enrollments WHERE class_id = $1', [
      classId,
    ]);
    expect(enrollments).toEqual([
      { status: 'LEFT', left_at: row.completed_at },
    ]);
    const audits = await dataSource.query<
      Array<{ actor_id: string | null; reason: string }>
    >(
      `SELECT actor_id, reason FROM audit_logs WHERE entity_type = 'TRAINING_CLASS' AND entity_id = $1`,
      [classId],
    );
    expect(audits).toEqual([
      { actor_id: null, reason: AUTO_COMPLETED_CLASS_REASON },
    ]);
  });

  it('keeps a class that ends today', async () => {
    const { classId } = await endedClass(TODAY);

    await expect(job.completeEndedClasses(TODAY)).resolves.toBe(0);

    expect(await classStatus(classId)).toBe('ACTIVE');
  });

  it.each(['SCHEDULED', 'IN_PROGRESS'])(
    'keeps an ended class that still has a %s session',
    async (sessionStatus) => {
      const { classId } = await endedClass();
      await addSession(classId, sessionStatus);

      await expect(job.completeEndedClasses(TODAY)).resolves.toBe(0);

      expect(await classStatus(classId)).toBe('ACTIVE');
    },
  );

  it.each(['CANCELLED', 'COMPLETED'])(
    'leaves an ended %s class untouched',
    async (status) => {
      const { classId } = await endedClass('2026-10-18', status);

      await expect(job.completeEndedClasses(TODAY)).resolves.toBe(0);

      expect(await classStatus(classId)).toBe(status);
    },
  );

  it('unblocks changing the barn head trainer once the forgotten class is auto-completed', async () => {
    const managerId = await seed.user(UserRole.CLUB_MANAGER);
    const [manager] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [managerId],
    );
    const actor: Actor = {
      sub: manager.keycloak_id,
      roles: [UserRole.CLUB_MANAGER],
    };
    const newHeadTrainerId = await seed.user(UserRole.HEAD_TRAINER);
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [headTrainerId, barnId],
    );
    const { classId } = await endedClass();
    await enroll(classId, await seed.horse('Ngựa 1', { barnId }));

    await expect(
      barns.update(actor, barnId, { headTrainerId: newHeadTrainerId }),
    ).rejects.toMatchObject({ status: 409 });

    await job.completeEndedClasses(TODAY);
    await barns.update(actor, barnId, { headTrainerId: newHeadTrainerId });

    const [barn] = await dataSource.query<Array<{ head_trainer_id: string }>>(
      'SELECT head_trainer_id FROM barns WHERE id = $1',
      [barnId],
    );
    expect(barn.head_trainer_id).toBe(newHeadTrainerId);
  });
});

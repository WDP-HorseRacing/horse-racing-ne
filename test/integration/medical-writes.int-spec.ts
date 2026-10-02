import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import { ExamRequestStatus } from '../../src/modules/medical/constants/exam-request.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { TRANSFER_CANCEL_REASON } from '../../src/modules/medical/constants/medical.constants';
import { CareScheduleWritesService } from '../../src/modules/medical/shared/care-schedule-writes.service';
import { ExamRequestWritesService } from '../../src/modules/medical/shared/exam-request-writes.service';
import { TrainingLockWritesService } from '../../src/modules/medical/shared/training-lock-writes.service';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

describe('Medical shared writes (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let vet: string;
  const locks = new TrainingLockWritesService();
  const schedules = new CareScheduleWritesService();
  const requests = new ExamRequestWritesService();

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(async () => {
    await truncateAll(dataSource);
    vet = await seed.user(UserRole.VETERINARIAN);
  });

  const lock = async (
    horseId: string,
    status: 'ACTIVE' | 'RELEASED',
    caseId: string | null = null,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status, case_id)
       VALUES ($1, 1, $2, $3, 'Nghỉ', now(), $4, $5)`,
      [id, horseId, vet, status, caseId],
    );
    return id;
  };

  const row = async (
    table: string,
    id: string,
  ): Promise<Record<string, unknown>> => {
    const [found] = await dataSource.query<Record<string, unknown>[]>(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id],
    );
    return found;
  };

  describe('TrainingLockWritesService', () => {
    it('attaches only the active lock without a case to the new case', async () => {
      const winx = await seed.horse('Winx');
      const other = await seed.horse('Other');
      const oldCase = await seed.medicalCase(winx, vet, {
        status: MedicalCaseStatus.CLOSED,
        closedAt: '2026-09-01T00:00:00Z',
      });
      const newCase = await seed.medicalCase(winx, vet);
      const active = await lock(winx, 'ACTIVE');
      const released = await lock(winx, 'RELEASED');
      const otherActive = await lock(other, 'ACTIVE');

      await expect(
        dataSource.transaction((m) =>
          locks.attachActiveLockToCase(m, winx, newCase),
        ),
      ).resolves.toBe(1);
      expect((await row('training_locks', active)).case_id).toBe(newCase);
      expect((await row('training_locks', released)).case_id).toBeNull();
      expect((await row('training_locks', otherActive)).case_id).toBeNull();

      await dataSource.query(
        'UPDATE training_locks SET case_id = $2 WHERE id = $1',
        [active, oldCase],
      );
      await expect(
        dataSource.transaction((m) =>
          locks.attachActiveLockToCase(m, winx, newCase),
        ),
      ).resolves.toBe(0);
    });

    it('detaches every lock of the case and keeps the lock itself', async () => {
      const winx = await seed.horse('Winx');
      const medicalCase = await seed.medicalCase(winx, vet);
      const active = await lock(winx, 'ACTIVE', medicalCase);
      const released = await lock(winx, 'RELEASED', medicalCase);

      await expect(
        dataSource.transaction((m) =>
          locks.detachLocksFromCase(m, medicalCase),
        ),
      ).resolves.toBe(2);
      expect(await row('training_locks', active)).toMatchObject({
        case_id: null,
        status: 'ACTIVE',
      });
      expect((await row('training_locks', released)).case_id).toBeNull();
    });

    it('releases one lock with the given person, time and conclusion', async () => {
      const winx = await seed.horse('Winx');
      const id = await lock(winx, 'ACTIVE');
      const at = new Date('2026-10-01T02:00:00Z');

      await dataSource.transaction((m) =>
        locks.releaseLock(m, id, {
          releasedBy: vet,
          releasedAt: at,
          releaseConclusion: 'Khỏi',
        }),
      );

      expect(await row('training_locks', id)).toMatchObject({
        status: 'RELEASED',
        released_by: vet,
        released_at: at,
        release_conclusion: 'Khỏi',
      });
    });

    it('releases only the active lock of the horse, without a person', async () => {
      const winx = await seed.horse('Winx');
      const active = await lock(winx, 'ACTIVE');
      const released = await lock(winx, 'RELEASED');

      await expect(
        dataSource.transaction((m) =>
          locks.releaseActiveLockOfHorse(m, winx, 'Chuyển nhượng'),
        ),
      ).resolves.toBe(1);
      expect(await row('training_locks', active)).toMatchObject({
        status: 'RELEASED',
        released_by: null,
        release_conclusion: 'Chuyển nhượng',
      });
      expect((await row('training_locks', released)).release_conclusion).toBe(
        null,
      );
    });

    it('changes the expected end of one lock', async () => {
      const winx = await seed.horse('Winx');
      const id = await lock(winx, 'ACTIVE');
      const end = new Date('2026-11-01T00:00:00Z');

      await dataSource.transaction((m) => locks.extendLockEnd(m, id, end));

      expect((await row('training_locks', id)).lock_end).toEqual(end);
    });
  });

  describe('CareScheduleWritesService', () => {
    it('completes only the scheduled routine checkup of the horse', async () => {
      const winx = await seed.horse('Winx');
      const other = await seed.horse('Other');
      const checkup = await seed.schedule(winx, '2026-10-10T00:00:00Z', {
        type: CareScheduleType.ROUTINE_CHECKUP,
      });
      const vaccine = await seed.schedule(winx, '2026-10-10T00:00:00Z', {
        type: CareScheduleType.VACCINATION,
      });
      const otherCheckup = await seed.schedule(other, '2026-10-10T00:00:00Z', {
        type: CareScheduleType.ROUTINE_CHECKUP,
      });

      await expect(
        dataSource.transaction((m) =>
          schedules.completeRoutineCheckup(m, winx, vet),
        ),
      ).resolves.toBe(1);
      expect(await row('care_schedules', checkup)).toMatchObject({
        status: CareScheduleStatus.COMPLETED,
        completed_by: vet,
      });
      expect((await row('care_schedules', vaccine)).status).toBe(
        CareScheduleStatus.SCHEDULED,
      );
      expect((await row('care_schedules', otherCheckup)).status).toBe(
        CareScheduleStatus.SCHEDULED,
      );
    });

    it('cancels every scheduled care schedule of a transferred horse', async () => {
      const winx = await seed.horse('Winx');
      const open = await seed.schedule(winx, '2026-10-10T00:00:00Z', {
        type: CareScheduleType.VACCINATION,
      });
      const done = await seed.schedule(winx, '2026-09-10T00:00:00Z', {
        type: CareScheduleType.VACCINATION,
        status: CareScheduleStatus.COMPLETED,
      });

      await expect(
        dataSource.transaction((m) =>
          schedules.cancelOpenSchedulesForTransfer(m, winx),
        ),
      ).resolves.toBe(1);
      expect(await row('care_schedules', open)).toMatchObject({
        status: CareScheduleStatus.CANCELLED,
        cancel_reason: TRANSFER_CANCEL_REASON,
      });
      expect((await row('care_schedules', done)).status).toBe(
        CareScheduleStatus.COMPLETED,
      );
    });
  });

  describe('ExamRequestWritesService', () => {
    it('marks only the given requests as examined by the visit', async () => {
      const winx = await seed.horse('Winx');
      const visit = await seed.visit(winx, vet, '2026-10-01T02:00:00Z');
      const first = await seed.examRequest(winx);
      const second = await seed.examRequest(winx);
      const untouched = await seed.examRequest(winx);

      await dataSource.transaction((m) =>
        requests.markExamined(m, [first, second], vet, visit),
      );

      for (const id of [first, second]) {
        expect(await row('medical_exam_requests', id)).toMatchObject({
          status: ExamRequestStatus.EXAMINED,
          handled_by: vet,
          medical_record_id: visit,
        });
      }
      expect((await row('medical_exam_requests', untouched)).status).toBe(
        ExamRequestStatus.PENDING,
      );
    });

    it('dismisses only pending requests of a transferred horse', async () => {
      const winx = await seed.horse('Winx');
      const pending = await seed.examRequest(winx);
      const dismissed = await seed.examRequest(winx, {
        status: ExamRequestStatus.DISMISSED,
      });
      const at = new Date('2026-10-01T02:00:00Z');

      await expect(
        dataSource.transaction((m) =>
          requests.dismissPendingForTransfer(m, winx, at),
        ),
      ).resolves.toBe(1);
      expect(await row('medical_exam_requests', pending)).toMatchObject({
        status: ExamRequestStatus.DISMISSED,
        dismiss_reason: TRANSFER_CANCEL_REASON,
        handled_by: null,
        handled_at: at,
      });
      expect(
        (await row('medical_exam_requests', dismissed)).dismiss_reason,
      ).toBeNull();
    });
  });
});

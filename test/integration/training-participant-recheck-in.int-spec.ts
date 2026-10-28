import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { MediaService } from '../../src/modules/media/services/media.service';
import { SessionParticipantEntity } from '../../src/modules/training/entities/session-participant.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { SessionParticipantsService } from '../../src/modules/training/training-sessions/session-participants.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Checking in again a run marked absent (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let participants: SessionParticipantsService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    participants = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      dataSource,
      {
        signDownloadUrls: () => Promise.resolve(new Map()),
      } as unknown as MediaService,
      new AuditService(),
      new DomainEventPublisher(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const actorOf = async (userId: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const seedRuns = async (horseCount: number) => {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const groomId = await seed.user(UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    const { classId } = await seed.trainingClass(trainerId);
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', 'REGULAR', now() - interval '10 minutes', now() + interval '50 minutes', 'IN_PROGRESS', 'LIGHT', 1200)`,
      [sessionId, classId],
    );
    const runIds: string[] = [];
    for (let index = 0; index < horseCount; index++) {
      const horse = await seed.horse(`Ngựa ${index}`, { barnId: barn });
      const enrollmentId = randomUUID();
      await dataSource.query(
        `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
         VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-09-05T00:00:00Z')`,
        [enrollmentId, classId, horse],
      );
      const runId = randomUUID();
      await dataSource.query(
        `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
         VALUES ($1, 1, $2, $3, $4, 'PLANNED', $5)`,
        [runId, sessionId, horse, enrollmentId, groomId],
      );
      runIds.push(runId);
    }
    return {
      sessionId,
      runIds,
      groom: await actorOf(groomId, UserRole.GROOM),
    };
  };

  const runOf = async (id: string) => {
    const [row] = await dataSource.query<
      Array<{
        status: string;
        absence_reason: string | null;
        checked_in_at: Date | null;
      }>
    >(
      'SELECT status, absence_reason, checked_in_at FROM session_participants WHERE id = $1',
      [id],
    );
    return row;
  };

  const sessionOf = async (id: string) => {
    const [row] = await dataSource.query<
      Array<{ status: string; cancel_reason: string | null }>
    >('SELECT status, cancel_reason FROM training_sessions WHERE id = $1', [
      id,
    ]);
    return row;
  };

  it('checks in again an absent run inside the window, clears the reason and logs ABSENT → PRESENT', async () => {
    const { runIds, groom, sessionId } = await seedRuns(2);
    const [id] = runIds;
    await participants.absent(groom, id, { reason: 'Bấm nhầm' });

    const response = await participants.checkIn(groom, id);

    expect(response).toMatchObject({ status: 'PRESENT' });
    const row = await runOf(id);
    expect(row).toMatchObject({ status: 'PRESENT', absence_reason: null });
    expect(row.checked_in_at).not.toBeNull();
    expect((await sessionOf(sessionId)).status).toBe('IN_PROGRESS');
    const audits = await dataSource.query<
      Array<{ before_data: unknown; after_data: unknown }>
    >(
      'SELECT before_data, after_data FROM audit_logs WHERE entity_id = $1 ORDER BY created_at',
      [id],
    );
    expect(audits).toEqual([
      { before_data: { status: 'PLANNED' }, after_data: { status: 'ABSENT' } },
      { before_data: { status: 'ABSENT' }, after_data: { status: 'PRESENT' } },
    ]);
  });

  it('reopens a one-horse session auto-closed as COMPLETED by the absence', async () => {
    const { runIds, groom, sessionId } = await seedRuns(1);
    await participants.absent(groom, runIds[0], { reason: 'Bấm nhầm' });
    expect((await sessionOf(sessionId)).status).toBe('COMPLETED');

    await participants.checkIn(groom, runIds[0]);

    expect((await sessionOf(sessionId)).status).toBe('IN_PROGRESS');
    expect((await runOf(runIds[0])).status).toBe('PRESENT');
  });

  it('closes the reopened one-horse session as CANCELLED when the horse is no longer eligible', async () => {
    const { runIds, groom, sessionId } = await seedRuns(1);
    await participants.absent(groom, runIds[0], { reason: 'Bấm nhầm' });
    await dataSource.query(
      `UPDATE horses SET health_status = 'INJURED' WHERE id = (SELECT horse_id FROM session_participants WHERE id = $1)`,
      [runIds[0]],
    );

    await expect(participants.checkIn(groom, runIds[0])).rejects.toThrow(
      'Ngựa không còn đủ điều kiện để điểm danh',
    );

    expect((await runOf(runIds[0])).status).toBe('INELIGIBLE');
    expect(await sessionOf(sessionId)).toEqual({
      status: 'CANCELLED',
      cancel_reason: 'Không còn ngựa tham gia',
    });
  });

  it('rejects checking in again after the session has ended with 409', async () => {
    const { runIds, groom } = await seedRuns(2);
    await participants.absent(groom, runIds[0], { reason: 'Bấm nhầm' });
    await dataSource.query(
      `UPDATE training_sessions SET scheduled_start_at = now() - interval '2 hours', scheduled_end_at = now() - interval '1 hour'`,
    );

    await expect(participants.checkIn(groom, runIds[0])).rejects.toThrow(
      /^Buổi tập đã hết giờ lúc /,
    );
    expect((await runOf(runIds[0])).status).toBe('ABSENT');
  });

  it('rejects checking in again in a manually cancelled session with 409', async () => {
    const { runIds, groom, sessionId } = await seedRuns(2);
    await participants.absent(groom, runIds[0], { reason: 'Bấm nhầm' });
    await dataSource.query(
      `UPDATE training_sessions SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Mưa lớn' WHERE id = $1`,
      [sessionId],
    );

    await expect(participants.checkIn(groom, runIds[0])).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((await runOf(runIds[0])).status).toBe('ABSENT');
  });

  it('rejects another groom with 403, also when the session was auto-closed', async () => {
    const { runIds, groom } = await seedRuns(1);
    await participants.absent(groom, runIds[0], { reason: 'Bấm nhầm' });
    const other = await actorOf(
      await seed.user(UserRole.GROOM),
      UserRole.GROOM,
    );

    await expect(participants.checkIn(other, runIds[0])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect((await runOf(runIds[0])).status).toBe('ABSENT');
  });
});

import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseHealthStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
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

describe('SessionParticipantsService eligibility at check-in and start (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: SessionParticipantsService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      new TrainingOperationsFacade(),
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const managerActor = async (): Promise<Actor> => {
    const id = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
  };

  const seedParticipant = async (
    participantStatus: 'PLANNED' | 'READY',
    options: {
      health?: HorseHealthStatus;
      locked?: boolean;
      intensity?: TrainingIntensity;
    } = {},
  ) => {
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const horse = await seed.horse('Winx', { health: options.health });
    const classId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_classes (id, version, name, code, head_trainer_id, start_date, end_date, status)
       VALUES ($1, 1, 'Lớp A', 'A', $2, '2026-09-01', '2026-12-31', 'ACTIVE')`,
      [classId, trainer],
    );
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-09-05T00:00:00Z')`,
      [enrollmentId, classId, horse],
    );
    const planId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_plans (id, version, class_id, created_by, name, phase_name, goal, start_date, end_date, status)
       VALUES ($1, 1, $2, $3, 'Giáo án', 'Nền tảng', 'Mục tiêu', '2026-09-01', '2026-12-31', 'ACTIVE')`,
      [planId, classId, trainer],
    );
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, plan_id, name, scheduled_start_at, scheduled_end_at, status, intensity)
       VALUES ($1, 1, $2, 'Buổi 1', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z', 'SCHEDULED', $3)`,
      [sessionId, planId, options.intensity ?? TrainingIntensity.MODERATE],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [participantId, sessionId, horse, enrollmentId, participantStatus],
    );
    if (options.locked) {
      const vet = await seed.user(UserRole.VETERINARIAN);
      await dataSource.query(
        `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status)
         VALUES ($1, 1, $2, $3, 'Nghỉ', now(), 'ACTIVE')`,
        [randomUUID(), horse, vet],
      );
    }
    return { participantId, sessionId };
  };

  const participantRow = async (participantId: string) => {
    const [row] = await dataSource.query<
      Array<{ status: string; ineligibility_reason: string | null }>
    >(
      'SELECT status, ineligibility_reason FROM session_participants WHERE id = $1',
      [participantId],
    );
    return row;
  };

  const sessionStatus = async (sessionId: string): Promise<string> => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM training_sessions WHERE id = $1',
      [sessionId],
    );
    return row.status;
  };

  describe('start', () => {
    it('keeps CANCELLED_BY_LOCK after rejecting a locked horse with 409', async () => {
      const actor = await managerActor();
      const { participantId, sessionId } = await seedParticipant('READY', {
        locked: true,
      });

      await expect(service.start(actor, participantId)).rejects.toThrow(
        new ConflictException('Ngựa không còn đủ điều kiện để bắt đầu'),
      );

      const row = await participantRow(participantId);
      expect(row.status).toBe('CANCELLED_BY_LOCK');
      expect(row.ineligibility_reason).not.toBeNull();
      expect(await sessionStatus(sessionId)).toBe('CANCELLED');
    });

    it('keeps INELIGIBLE after rejecting an UNDER_OBSERVATION horse in a HEAVY session', async () => {
      const actor = await managerActor();
      const { participantId } = await seedParticipant('READY', {
        health: HorseHealthStatus.UNDER_OBSERVATION,
        intensity: TrainingIntensity.HEAVY,
      });

      await expect(service.start(actor, participantId)).rejects.toThrow(
        new ConflictException('Ngựa không còn đủ điều kiện để bắt đầu'),
      );

      expect(await participantRow(participantId)).toEqual({
        status: 'INELIGIBLE',
        ineligibility_reason: 'HEALTH_UNDER_OBSERVATION',
      });
    });

    it('keeps INELIGIBLE after rejecting an injured horse with 409', async () => {
      const actor = await managerActor();
      const { participantId } = await seedParticipant('READY', {
        health: HorseHealthStatus.INJURED,
      });

      await expect(service.start(actor, participantId)).rejects.toThrow(
        ConflictException,
      );

      expect((await participantRow(participantId)).status).toBe('INELIGIBLE');
    });
  });

  describe('checkIn', () => {
    it('keeps CANCELLED_BY_LOCK after rejecting a locked horse with 409', async () => {
      const actor = await managerActor();
      const { participantId, sessionId } = await seedParticipant('PLANNED', {
        locked: true,
      });

      await expect(service.checkIn(actor, participantId)).rejects.toThrow(
        new ConflictException('Ngựa không còn đủ điều kiện để điểm danh'),
      );

      const row = await participantRow(participantId);
      expect(row.status).toBe('CANCELLED_BY_LOCK');
      expect(row.ineligibility_reason).not.toBeNull();
      expect(await sessionStatus(sessionId)).toBe('CANCELLED');
    });

    it('keeps INELIGIBLE after rejecting a quarantined horse with 409', async () => {
      const actor = await managerActor();
      const { participantId } = await seedParticipant('PLANNED', {
        health: HorseHealthStatus.QUARANTINED,
      });

      await expect(service.checkIn(actor, participantId)).rejects.toThrow(
        ConflictException,
      );

      expect((await participantRow(participantId)).status).toBe('INELIGIBLE');
    });

    it('keeps INELIGIBLE after rejecting an UNDER_OBSERVATION horse in a HEAVY session', async () => {
      const actor = await managerActor();
      const { participantId } = await seedParticipant('PLANNED', {
        health: HorseHealthStatus.UNDER_OBSERVATION,
        intensity: TrainingIntensity.HEAVY,
      });

      await expect(service.checkIn(actor, participantId)).rejects.toThrow(
        new ConflictException('Ngựa không còn đủ điều kiện để điểm danh'),
      );

      expect((await participantRow(participantId)).status).toBe('INELIGIBLE');
    });

    it('checks in an eligible horse', async () => {
      const actor = await managerActor();
      const { participantId } = await seedParticipant('PLANNED', {
        health: HorseHealthStatus.UNDER_OBSERVATION,
      });

      const result = await service.checkIn(actor, participantId);

      expect(result.status).toBe('PRESENT');
      expect((await participantRow(participantId)).status).toBe('PRESENT');
    });
  });
});

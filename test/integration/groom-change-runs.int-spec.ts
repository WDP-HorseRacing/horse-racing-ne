import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { GroomAssignmentEntity } from '../../src/modules/stable/entities/groom-assignment.entity';
import { GroomAssignmentsRepository } from '../../src/modules/stable/groom-assignments/groom-assignments.repository';
import { GroomAssignmentsService } from '../../src/modules/stable/groom-assignments/groom-assignments.service';
import { DailyChecklistsService } from '../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const MINUTE = 60_000;
const ON_SITE_MESSAGE = 'Ngựa đang ở buổi tập, đổi Groom sau khi buổi kết thúc';

describe('Changing the groom of a horse with training runs (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let grooms: GroomAssignmentsService;
  let trainer: Actor;
  let trainerId: string;
  let groomA: string;
  let groomB: string;
  let classId: string;
  let gio: string;
  let sam: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const enroll = async (inClassId: string, horseId: string) => {
    const [enrollment] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
       VALUES (1, $1, $2, 'ACTIVE', now() - interval '1 day') RETURNING id`,
      [inClassId, horseId],
    );
    return enrollment.id;
  };

  const run = async (input: {
    horseId: string;
    status: string;
    startInMinutes: number;
    groomId: string | null;
    name?: string;
    inClassId?: string;
  }): Promise<string> => {
    const sessionId = randomUUID();
    const start = new Date(Date.now() + input.startInMinutes * MINUTE);
    const end = new Date(start.getTime() + 60 * MINUTE);
    const sessionStatus =
      end.getTime() <= Date.now()
        ? 'COMPLETED'
        : start.getTime() <= Date.now()
          ? 'IN_PROGRESS'
          : 'SCHEDULED';
    const inClassId = input.inClassId ?? classId;
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m, location, surface)
       VALUES ($1, 1, $2, $3, $4, $5, $6, 'LIGHT', 1000, 'Sân 1', 'Cát')`,
      [
        sessionId,
        inClassId,
        input.name ?? `Buổi ${sessionId.slice(0, 8)}`,
        start,
        end,
        sessionStatus,
      ],
    );
    const [enrollment] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM horse_enrollments WHERE horse_id = $1 AND class_id = $2',
      [input.horseId, inClassId],
    );
    const [participant] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO session_participants (version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES (1, $1, $2, $3, $4, $5) RETURNING id`,
      [sessionId, input.horseId, enrollment.id, input.status, input.groomId],
    );
    return participant.id;
  };

  const groomOf = async (participantId: string) =>
    (
      await dataSource.query<{ assigned_groom_id: string | null }[]>(
        'SELECT assigned_groom_id FROM session_participants WHERE id = $1',
        [participantId],
      )
    )[0].assigned_groom_id;

  const giveGroom = (horseId: string, groomId: string) =>
    dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now() - interval '1 day')`,
      [horseId, groomId],
    );

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const events = new DomainEventPublisher();
    grooms = new GroomAssignmentsService(
      dataSource.getRepository(GroomAssignmentEntity),
      dataSource,
      new AuditService(),
      events,
      new StableAccessService(new HorseAccessService(dataSource)),
      new HorseAccessService(dataSource),
      new DailyChecklistsService(events),
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      new GroomAssignmentsRepository(dataSource),
    );
  });

  afterAll(async () => {
    await stopTestPostgres(db);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    groomA = await seed.user(UserRole.GROOM);
    groomB = await seed.user(UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    gio = await seed.horse('Gió', { barnId: barn });
    sam = await seed.horse('Sấm', { barnId: barn });
    ({ classId } = await seed.trainingClass(trainerId));
    await giveGroom(gio, groomA);
    await giveGroom(sam, groomB);
    await enroll(classId, gio);
    await enroll(classId, sam);
  });

  describe('the horse is at a training session', () => {
    it.each(['PRESENT', 'READY', 'ONGOING'])(
      'answers 409 when a run is %s, writing nothing',
      async (status) => {
        const onSite = await run({
          horseId: gio,
          status,
          startInMinutes: -10,
          groomId: groomA,
        });
        const later = await run({
          horseId: gio,
          status: 'PLANNED',
          startInMinutes: 24 * 60,
          groomId: groomA,
        });

        await expect(
          grooms.assign(trainer, gio, { groomId: groomB }),
        ).rejects.toThrow(new ConflictException(ON_SITE_MESSAGE));

        expect(await groomOf(onSite)).toBe(groomA);
        expect(await groomOf(later)).toBe(groomA);
        expect(
          await dataSource.query(
            'SELECT groom_id, end_at FROM groom_assignments WHERE horse_id = $1',
            [gio],
          ),
        ).toEqual([{ groom_id: groomA, end_at: null }]);
        expect(await dataSource.query('SELECT id FROM audit_logs')).toEqual([]);
        expect(await dataSource.query('SELECT id FROM outbox_events')).toEqual(
          [],
        );
      },
    );

    it('answers 409 when the run is in a class of another head trainer', async () => {
      const otherTrainer = await seed.user(UserRole.HEAD_TRAINER);
      const { classId: otherClass } = await seed.trainingClass(otherTrainer, {
        code: 'OTHER-01',
      });
      await enroll(otherClass, gio);
      await run({
        horseId: gio,
        status: 'PRESENT',
        startInMinutes: -10,
        groomId: null,
        inClassId: otherClass,
      });

      await expect(
        grooms.assign(trainer, gio, { groomId: groomB }),
      ).rejects.toThrow(new ConflictException(ON_SITE_MESSAGE));
    });

    it('answers 409 to a first groom assignment too', async () => {
      await dataSource.query(
        'DELETE FROM groom_assignments WHERE horse_id = $1',
        [gio],
      );
      await run({
        horseId: gio,
        status: 'READY',
        startInMinutes: -10,
        groomId: null,
      });

      await expect(
        grooms.assign(trainer, gio, { groomId: groomB }),
      ).rejects.toThrow(new ConflictException(ON_SITE_MESSAGE));
    });

    it('still accepts assigning the current groom again, changing nothing', async () => {
      await run({
        horseId: gio,
        status: 'ONGOING',
        startInMinutes: -10,
        groomId: groomA,
      });

      const response = await grooms.assign(trainer, gio, { groomId: groomA });

      expect(response.groomId).toBe(groomA);
    });
  });

  describe('runs moved to the new groom', () => {
    it.each([
      ['PLANNED', -10],
      ['PLANNED', 24 * 60],
      ['ABSENT', -10],
      ['ABSENT', 24 * 60],
      ['INELIGIBLE', 24 * 60],
      ['CANCELLED_BY_LOCK', 24 * 60],
    ])(
      'moves a %s run of a session starting in %i minutes',
      async (status, startInMinutes) => {
        const moving = await run({
          horseId: gio,
          status,
          startInMinutes,
          groomId: groomA,
        });

        await grooms.assign(trainer, gio, { groomId: groomB });

        expect(await groomOf(moving)).toBe(groomB);
      },
    );

    it('fills runs with no groom and leaves runs led by another groom', async () => {
      const groomC = await seed.user(UserRole.GROOM);
      const unled = await run({
        horseId: gio,
        status: 'ABSENT',
        startInMinutes: -10,
        groomId: null,
      });
      const ledByOther = await run({
        horseId: gio,
        status: 'PLANNED',
        startInMinutes: 24 * 60,
        groomId: groomC,
      });

      await grooms.assign(trainer, gio, { groomId: groomB });

      expect(await groomOf(unled)).toBe(groomB);
      expect(await groomOf(ledByOther)).toBe(groomC);
    });

    it('rejects a PLANNED run of a started session that clashes with a run of the new groom', async () => {
      const moving = await run({
        horseId: gio,
        status: 'PLANNED',
        startInMinutes: -10,
        groomId: groomA,
        name: 'Sáng',
      });
      await run({
        horseId: sam,
        status: 'PLANNED',
        startInMinutes: 0,
        groomId: groomB,
        name: 'Sức bền',
      });

      await expect(
        grooms.assign(trainer, gio, { groomId: groomB }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await groomOf(moving)).toBe(groomA);
    });

    it.each(['INELIGIBLE', 'CANCELLED_BY_LOCK'])(
      'moves a %s run without a clash with a run of the new groom at the same time',
      async (status) => {
        const moving = await run({
          horseId: gio,
          status,
          startInMinutes: 24 * 60,
          groomId: groomA,
        });
        await run({
          horseId: sam,
          status: 'PLANNED',
          startInMinutes: 24 * 60 + 30,
          groomId: groomB,
        });

        await grooms.assign(trainer, gio, { groomId: groomB });

        expect(await groomOf(moving)).toBe(groomB);
      },
    );

    it.each([-10, 24 * 60])(
      'rejects moving an ABSENT run of a session starting in %i minutes that clashes with a run of the new groom',
      async (startInMinutes) => {
        const moving = await run({
          horseId: gio,
          status: 'ABSENT',
          startInMinutes,
          groomId: groomA,
        });
        await run({
          horseId: sam,
          status: 'PLANNED',
          startInMinutes: startInMinutes + 30,
          groomId: groomB,
        });

        await expect(
          grooms.assign(trainer, gio, { groomId: groomB }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await groomOf(moving)).toBe(groomA);
      },
    );

    it('rejects moving a run that clashes with an ABSENT run the new groom leads in a session not yet ended', async () => {
      const moving = await run({
        horseId: gio,
        status: 'PLANNED',
        startInMinutes: 20,
        groomId: groomA,
      });
      await run({
        horseId: sam,
        status: 'ABSENT',
        startInMinutes: -10,
        groomId: groomB,
      });

      await expect(
        grooms.assign(trainer, gio, { groomId: groomB }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await groomOf(moving)).toBe(groomA);
    });

    it('ignores an ABSENT run the new groom leads in a session already ended', async () => {
      const moving = await run({
        horseId: gio,
        status: 'PLANNED',
        startInMinutes: -10,
        groomId: groomA,
      });
      await run({
        horseId: sam,
        status: 'ABSENT',
        startInMinutes: -65,
        groomId: groomB,
      });

      await grooms.assign(trainer, gio, { groomId: groomB });

      expect(await groomOf(moving)).toBe(groomB);
    });

    it('records the moved runs in the audit log', async () => {
      const moving = await run({
        horseId: gio,
        status: 'ABSENT',
        startInMinutes: -10,
        groomId: groomA,
      });

      await grooms.assign(trainer, gio, { groomId: groomB });

      const [audit] = await dataSource.query<
        { after_data: { movedParticipantIds: string[] } }[]
      >(
        "SELECT after_data FROM audit_logs WHERE entity_type = 'GROOM_ASSIGNMENT'",
      );
      expect(audit.after_data.movedParticipantIds).toEqual([moving]);
    });
  });

  describe('runs kept with the old groom', () => {
    it.each([
      ['COMPLETED', -120],
      ['STOPPED', -120],
      ['SKIPPED', -120],
      ['CANCELLED', 24 * 60],
      ['COMPLETED', -10],
      ['STOPPED', -10],
      ['SKIPPED', -10],
      ['CANCELLED', -10],
      ['ABSENT', -120],
      ['PLANNED', -120],
      ['INELIGIBLE', -10],
      ['CANCELLED_BY_LOCK', -10],
    ])(
      'keeps a %s run of a session starting in %i minutes',
      async (status, startInMinutes) => {
        const kept = await run({
          horseId: gio,
          status,
          startInMinutes,
          groomId: groomA,
        });

        await grooms.assign(trainer, gio, { groomId: groomB });

        expect(await groomOf(kept)).toBe(groomA);
      },
    );
  });
});

import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import {
  clubDateTimeToInstant,
  clubToday,
  shiftDays,
  toDisplayDate,
} from '../../src/common/utils/club-date';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { HorseNotificationsService } from '../../src/modules/notifications/delivery/horse-notifications.service';
import { NotificationDeliveryService } from '../../src/modules/notifications/delivery/notification-delivery.service';
import { NotificationRecipientsRepository } from '../../src/modules/notifications/delivery/notification-recipients.repository';
import { TrainingRunGroomAssignedListener } from '../../src/modules/notifications/delivery/training-run-groom-assigned.listener';
import {
  NotificationRecord,
  NotificationSchema,
} from '../../src/modules/notifications/schemas/notification.schema';
import { GroomAssignmentEntity } from '../../src/modules/stable/entities/groom-assignment.entity';
import { GroomAssignmentsRepository } from '../../src/modules/stable/groom-assignments/groom-assignments.repository';
import { GroomAssignmentsService } from '../../src/modules/stable/groom-assignments/groom-assignments.service';
import { DailyChecklistsService } from '../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { TRAINING_RUN_GROOM_ASSIGNED_EVENT } from '../../src/modules/training/constants/training-events.constants';
import { SessionParticipantEntity } from '../../src/modules/training/entities/session-participant.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { SessionParticipantsService } from '../../src/modules/training/training-sessions/session-participants.service';
import type { TrainingRunGroomAssignedEvent } from '../../src/modules/training/types/training-session.types';
import { fixtures } from './fixtures';
import {
  clearAllMongoCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from './mongo';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Assigning grooms to training runs (Postgres)', () => {
  let db: TestPostgres;
  let mongo: TestMongo;
  let dataSource: DataSource;
  let model: Model<NotificationRecord>;
  let seed: ReturnType<typeof fixtures>;
  let participants: SessionParticipantsService;
  let grooms: GroomAssignmentsService;
  let listener: TrainingRunGroomAssignedListener;
  let trainer: Actor;
  let groomA: string;
  let groomB: string;
  let classId: string;
  let gio: string;
  let sam: string;
  let tomorrow: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const at = (time: string) => clubDateTimeToInstant(tomorrow, time);

  const run = async (
    horseId: string,
    name: string,
    start: Date,
    groomId: string | null,
  ): Promise<string> => {
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m, location, surface)
       VALUES ($1, 1, $2, $3, $4, $5, 'SCHEDULED', 'LIGHT', 1000, 'Sân 1', 'Cát')`,
      [sessionId, classId, name, start, new Date(start.getTime() + 3_600_000)],
    );
    const [enrollment] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM horse_enrollments WHERE horse_id = $1',
      [horseId],
    );
    const [participant] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO session_participants (version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES (1, $1, $2, $3, 'PLANNED', $4) RETURNING id`,
      [sessionId, horseId, enrollment.id, groomId],
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

  const outbox = () =>
    dataSource.query<{ payload: TrainingRunGroomAssignedEvent }[]>(
      'SELECT payload FROM outbox_events WHERE event_name = $1',
      [TRAINING_RUN_GROOM_ASSIGNED_EVENT],
    );

  beforeAll(async () => {
    db = await startTestPostgres();
    mongo = await startTestMongo();
    dataSource = db.dataSource;
    model = mongo.connection.model(NotificationRecord.name, NotificationSchema);
    await model.init();
    seed = fixtures(dataSource);
    const events = new DomainEventPublisher();
    const facade = new TrainingOperationsFacade(
      new TrainingAccessService({} as DataSource, {} as HorseAccessService),
    );
    participants = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      facade,
      dataSource,
      {} as MediaService,
      new AuditService(),
      events,
    );
    grooms = new GroomAssignmentsService(
      dataSource.getRepository(GroomAssignmentEntity),
      dataSource,
      new AuditService(),
      events,
      new StableAccessService(new HorseAccessService(dataSource)),
      new HorseAccessService(dataSource),
      new DailyChecklistsService(events),
      facade,
      new GroomAssignmentsRepository(dataSource),
    );
    listener = new TrainingRunGroomAssignedListener(
      new HorseNotificationsService(
        new NotificationRecipientsRepository(dataSource),
        new NotificationDeliveryService(model, [], null),
        dataSource,
      ),
    );
  });

  afterAll(async () => {
    await stopTestPostgres(db);
    await stopTestMongo(mongo);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
    tomorrow = shiftDays(clubToday(), 1);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
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
    for (const [horseId, groomId] of [
      [gio, groomA],
      [sam, groomB],
    ]) {
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, now() - interval '1 day')`,
        [horseId, groomId],
      );
      await dataSource.query(
        `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
         VALUES (1, $1, $2, 'ACTIVE', now() - interval '1 day')`,
        [classId, horseId],
      );
    }
  });

  describe('a head trainer picks the groom of one run', () => {
    it('rejects a groom already leading another run at the same time, writing nothing', async () => {
      const target = await run(gio, 'Sáng', at('06:00'), groomA);
      await run(sam, 'Sức bền', at('06:30'), groomB);

      const result = participants.assignGroom(trainer, target, {
        groomId: groomB,
      });

      await expect(result).rejects.toThrow(
        new ConflictException(
          `Groom đang dắt ngựa Sấm ở buổi "Sức bền" lúc 06:30 ngày ${toDisplayDate(tomorrow)}, trùng giờ với lượt này`,
        ),
      );
      expect(await groomOf(target)).toBe(groomA);
      expect(await outbox()).toEqual([]);
    });

    it('answers 403 to a head trainer outside the class before checking that the session is no longer operational', async () => {
      const target = await run(gio, 'Sáng', at('06:00'), groomA);
      await dataSource.query(
        `UPDATE training_sessions SET status = 'CANCELLED'
          WHERE id = (SELECT session_id FROM session_participants WHERE id = $1)`,
        [target],
      );
      const outsider = await actorOf(
        await seed.user(UserRole.HEAD_TRAINER),
        UserRole.HEAD_TRAINER,
      );

      await expect(
        participants.assignGroom(outsider, target, { groomId: groomB }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await groomOf(target)).toBe(groomA);
    });

    it('lets only one of two head trainers give the same groom two clashing runs at once', async () => {
      const first = await run(gio, 'Sáng', at('06:00'), groomA);
      const second = await run(sam, 'Sức bền', at('06:30'), groomB);
      const groomC = await seed.user(UserRole.GROOM);
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      await holder.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        groomC,
      ]);
      const running = [first, second].map((id) =>
        participants.assignGroom(trainer, id, { groomId: groomC }),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await holder.rollbackTransaction();
      await holder.release();

      const outcomes = await Promise.allSettled(running);

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(
        [await groomOf(first), await groomOf(second)].filter(
          (id) => id === groomC,
        ),
      ).toHaveLength(1);
    });

    it('accepts a groom whose other run ends right when this one starts', async () => {
      const target = await run(gio, 'Sáng', at('07:00'), groomA);
      await run(sam, 'Sức bền', at('06:00'), groomB);

      await participants.assignGroom(trainer, target, { groomId: groomB });

      expect(await groomOf(target)).toBe(groomB);
    });

    it('records an event the listener turns into one notice for the new groom', async () => {
      const target = await run(gio, 'Sáng', at('06:00'), groomA);

      await participants.assignGroom(trainer, target, { groomId: groomB });

      const [row] = await outbox();
      expect(row.payload).toMatchObject({
        participantId: target,
        groomId: groomB,
        horseId: gio,
        horseName: 'Gió',
        sessionName: 'Sáng',
        scheduledStartAt: at('06:00').toISOString(),
        location: 'Sân 1',
        surface: 'Cát',
      });
      await listener.handle(row.payload);
      await listener.handle(row.payload);
      const stored = await model
        .find({}, { _id: 0, recipientId: 1, category: 1, message: 1 })
        .lean();
      expect(stored).toEqual([
        {
          recipientId: groomB,
          category: 'TRAINING_SESSION',
          message: `Bạn được giao dắt Gió ở buổi tập Sáng lúc 06:00 ngày ${toDisplayDate(tomorrow)}, tại Sân 1, mặt sân Cát.`,
        },
      ]);
    });

    it('records no event when the groom is removed or stays the same', async () => {
      const target = await run(gio, 'Sáng', at('06:00'), groomA);

      await participants.assignGroom(trainer, target, { groomId: groomA });
      await participants.assignGroom(trainer, target, { groomId: null });

      expect(await groomOf(target)).toBeNull();
      expect(await outbox()).toEqual([]);
    });
  });

  describe('a head trainer changes the groom of a horse', () => {
    it('rejects the change when a run to move clashes with a run of the new groom, writing nothing', async () => {
      const moving = await run(gio, 'Sáng', at('06:00'), groomA);
      await run(sam, 'Sức bền', at('06:30'), groomB);

      const result = grooms.assign(trainer, gio, { groomId: groomB });

      await expect(result).rejects.toThrow(
        new ConflictException(
          `Groom mới đang dắt lượt trùng giờ: buổi "Sáng" lúc 06:00 ngày ${toDisplayDate(tomorrow)} trùng lượt ngựa Sấm ở buổi "Sức bền" lúc 06:30 ngày ${toDisplayDate(tomorrow)}. Giao lại người dắt các lượt này trước khi đổi Groom`,
        ),
      );
      expect(await groomOf(moving)).toBe(groomA);
      expect(
        await dataSource.query(
          'SELECT groom_id, end_at FROM groom_assignments WHERE horse_id = $1',
          [gio],
        ),
      ).toEqual([{ groom_id: groomA, end_at: null }]);
      expect(await dataSource.query('SELECT id FROM daily_checklists')).toEqual(
        [],
      );
      expect(await dataSource.query('SELECT id FROM outbox_events')).toEqual(
        [],
      );
      expect(await dataSource.query('SELECT id FROM audit_logs')).toEqual([]);
    });

    it('moves runs when the new groom is free and sends no per-run notice', async () => {
      const moving = await run(gio, 'Sáng', at('06:00'), groomA);
      await run(sam, 'Sức bền', at('07:00'), groomB);

      await grooms.assign(trainer, gio, { groomId: groomB });

      expect(await groomOf(moving)).toBe(groomB);
      expect(await outbox()).toEqual([]);
    });
  });
});

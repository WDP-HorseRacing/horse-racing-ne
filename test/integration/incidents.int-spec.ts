import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../../src/modules/medical/constants/exam-request.enum';
import { MEDICAL_EXAM_REQUEST_URGENT_EVENT } from '../../src/modules/medical/constants/medical-events.constants';
import { MedicalExamRequestEntity } from '../../src/modules/medical/entities/medical-exam-request.entity';
import { ExamRequestsService } from '../../src/modules/medical/exam-requests/exam-requests.service';
import type { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import { IncidentStatus } from '../../src/modules/stable/constants/incident-status.enum';
import {
  INCIDENT_HANDLED_EVENT,
  INCIDENT_REPORTED_EVENT,
  INCIDENT_STALE_EVENT,
} from '../../src/modules/stable/constants/stable-events.constants';
import { IncidentListQueryDto } from '../../src/modules/stable/dto/incident.dto';
import { IncidentEntity } from '../../src/modules/stable/entities/incident.entity';
import { HorseStatusesRepository } from '../../src/modules/horses/horse-statuses/horse-statuses.repository';
import { IncidentRemindersService } from '../../src/modules/stable/incidents/incident-reminders.service';
import { IncidentsService } from '../../src/modules/stable/incidents/incidents.service';
import { IncidentWritesService } from '../../src/modules/stable/shared/incident-writes.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Stable incidents (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let incidents: IncidentsService;
  let trainer: Actor;
  let otherTrainer: Actor;
  let groom: Actor;
  let otherGroom: Actor;
  let vet: Actor;
  let manager: Actor;
  let groomId: string;
  let gio: string;
  let outside: string;

  const media = {
    assertAttachableIncidentPhoto: jest.fn().mockResolvedValue(undefined),
    signDownloadUrls: jest.fn((ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, `https://photo/${id}`]))),
    ),
  };

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const photo = async (uploadedBy: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO media_assets (id, uploaded_by, object_key, mime_type, byte_size)
       VALUES ($1, $2, $3, 'image/jpeg', 100)`,
      [id, uploadedBy, `incident-photos/${id}.jpg`],
    );
    return id;
  };

  const outbox = (name: string) =>
    dataSource.query<{ payload: Record<string, unknown> }[]>(
      'SELECT payload FROM outbox_events WHERE event_name = $1',
      [name],
    );

  const page = () =>
    Object.assign(new IncidentListQueryDto(), { page: 1, limit: 20 });

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const horseAccess = new HorseAccessService(dataSource);
    const events = new DomainEventPublisher();
    incidents = new IncidentsService(
      dataSource.getRepository(IncidentEntity),
      new StableAccessService(horseAccess),
      horseAccess,
      media as unknown as MediaService,
      new ExamRequestsService(
        dataSource,
        dataSource.getRepository(MedicalExamRequestEntity),
        {} as MedicalAccessService,
        horseAccess,
        new AuditService(),
        events,
      ),
      events,
      dataSource,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const otherTrainerId = await seed.user(UserRole.HEAD_TRAINER);
    groomId = await seed.user(UserRole.GROOM);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    otherTrainer = await actorOf(otherTrainerId, UserRole.HEAD_TRAINER);
    groom = await actorOf(groomId, UserRole.GROOM);
    otherGroom = await actorOf(await seed.user(UserRole.GROOM), UserRole.GROOM);
    vet = await actorOf(
      await seed.user(UserRole.VETERINARIAN),
      UserRole.VETERINARIAN,
    );
    manager = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const barn = await seed.barn('Khu A');
    const otherBarn = await seed.barn('Khu B');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [otherTrainerId, otherBarn],
    );
    gio = await seed.horse('Gió', { barnId: barn });
    outside = await seed.horse('Sấm', { barnId: otherBarn });
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [gio, groomId],
    );
  });

  describe('reporting', () => {
    it('opens an urgent exam request and tells the vets and the trainer', async () => {
      const shown = await incidents.report(groom, {
        horseId: gio,
        description: ' Nằm lăn, bỏ ăn ',
        urgent: true,
      });

      expect(shown).toMatchObject({
        status: IncidentStatus.OPEN,
        description: 'Nằm lăn, bỏ ăn',
        urgent: true,
        horseName: 'Gió',
        photoUrl: null,
      });
      expect(shown.examRequest).toMatchObject({
        status: ExamRequestStatus.PENDING,
        urgent: true,
      });
      const [exam] = await dataSource.query<
        { source: string; incident_id: string }[]
      >('SELECT source, incident_id FROM medical_exam_requests');
      expect(exam).toEqual({
        source: ExamRequestSource.GROOM_INCIDENT,
        incident_id: shown.id,
      });
      expect(await outbox(MEDICAL_EXAM_REQUEST_URGENT_EVENT)).toHaveLength(1);
      const reported = await outbox(INCIDENT_REPORTED_EVENT);
      expect(reported).toHaveLength(1);
      expect(reported[0].payload).toMatchObject({
        incidentId: shown.id,
        urgent: true,
      });
    });

    it('keeps a routine incident with the trainer only', async () => {
      const shown = await incidents.report(groom, {
        horseId: gio,
        description: 'Móng xước nhẹ',
      });

      expect(shown.examRequest).toBeNull();
      expect(shown.urgent).toBe(false);
      expect(
        await dataSource.query('SELECT id FROM medical_exam_requests'),
      ).toEqual([]);
      expect(await outbox(MEDICAL_EXAM_REQUEST_URGENT_EVENT)).toEqual([]);
      expect(await outbox(INCIDENT_REPORTED_EVENT)).toHaveLength(1);
    });

    it('attaches one photo once', async () => {
      const photoId = await photo(groomId);
      const shown = await incidents.report(groom, {
        horseId: gio,
        description: 'Móng xước',
        photoMediaId: photoId,
      });

      expect(shown.photoUrl).toBe(`https://photo/${photoId}`);
      await expect(
        incidents.report(groom, {
          horseId: gio,
          description: 'Lần hai',
          photoMediaId: photoId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets a groom who does not care for the horse report it, and tells the groom in charge', async () => {
      const shown = await incidents.report(otherGroom, {
        horseId: gio,
        description: 'Thấy nằm lăn lúc trực đêm',
      });

      expect(shown.status).toBe(IncidentStatus.OPEN);
      const [reported] = await outbox(INCIDENT_REPORTED_EVENT);
      expect(reported.payload).toMatchObject({
        incidentId: shown.id,
        assignedGroomId: groomId,
      });
      await expect(incidents.get(otherGroom, shown.id)).resolves.toMatchObject({
        id: shown.id,
      });
    });

    it('does not name the groom in charge again when that groom reports', async () => {
      await incidents.report(groom, { horseId: gio, description: 'Móng xước' });

      const [reported] = await outbox(INCIDENT_REPORTED_EVENT);
      expect(reported.payload).toMatchObject({ assignedGroomId: null });
    });

    it('rejects a deceased horse with 409 and a deleted one with 404', async () => {
      await dataSource.query(
        'UPDATE horses SET lifecycle_status = $1 WHERE id = $2',
        [HorseLifecycleStatus.DECEASED, gio],
      );
      await expect(
        incidents.report(groom, { horseId: gio, description: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);

      await dataSource.query(
        'UPDATE horses SET deleted_at = now() WHERE id = $1',
        [gio],
      );
      await expect(
        incidents.report(groom, { horseId: gio, description: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('referring and resolving', () => {
    let routineId: string;

    beforeEach(async () => {
      routineId = (
        await incidents.report(groom, {
          horseId: gio,
          description: 'Bỏ ăn một bữa',
        })
      ).id;
    });

    it('resolves a routine incident without a vet', async () => {
      const resolved = await incidents.resolve(trainer, routineId, {
        resolution: ' Báo nhầm, ngựa bình thường ',
      });

      expect(resolved).toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolution: 'Báo nhầm, ngựa bình thường',
      });
      expect(resolved.resolver).not.toBeNull();
      await expect(
        incidents.resolve(trainer, routineId, { resolution: 'lần hai' }),
      ).rejects.toBeInstanceOf(ConflictException);
      const handled = await outbox(INCIDENT_HANDLED_EVENT);
      expect(handled).toHaveLength(1);
      expect(handled[0].payload).toMatchObject({
        eventId: expect.any(String) as unknown,
        incidentId: routineId,
        horseId: gio,
        reportedBy: groomId,
        handledBy: resolved.resolver?.id,
        action: 'RESOLVED',
        resolution: 'Báo nhầm, ngựa bình thường',
      });
    });

    it('records the referral to a vet for the reporter and the groom in charge', async () => {
      await incidents.refer(trainer, routineId, {});

      const handled = await outbox(INCIDENT_HANDLED_EVENT);
      expect(handled).toHaveLength(1);
      expect(handled[0].payload).toMatchObject({
        incidentId: routineId,
        horseId: gio,
        reportedBy: groomId,
        action: 'REFERRED',
        resolution: null,
      });
    });

    it('refers once, then waits for the vet before closing', async () => {
      const referred = await incidents.refer(trainer, routineId, {});
      expect(referred.examRequest).toMatchObject({
        status: ExamRequestStatus.PENDING,
        urgent: false,
      });
      await expect(
        incidents.refer(trainer, routineId, {}),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        incidents.resolve(trainer, routineId, { resolution: 'xong' }),
      ).rejects.toBeInstanceOf(ConflictException);

      await dataSource.query(
        `UPDATE medical_exam_requests SET status = $1, dismiss_reason = 'Không cần khám'`,
        [ExamRequestStatus.DISMISSED],
      );
      const resolved = await incidents.resolve(trainer, routineId, {
        resolution: 'Đã sát trùng',
      });
      expect(resolved.status).toBe(IncidentStatus.RESOLVED);
      expect(resolved.examRequest?.dismissReason).toBe('Không cần khám');
    });

    it('lets the trainer refer as urgent and alerts every vet', async () => {
      const referred = await incidents.refer(trainer, routineId, {
        urgent: true,
      });

      expect(referred.urgent).toBe(true);
      expect(referred.examRequest?.urgent).toBe(true);
      expect(await outbox(MEDICAL_EXAM_REQUEST_URGENT_EVENT)).toHaveLength(1);
    });

    it('follows the vet when the exam request urgency changes', async () => {
      await incidents.refer(trainer, routineId, { urgent: true });
      await dataSource.query(
        'UPDATE medical_exam_requests SET urgent = false WHERE incident_id = $1',
        [routineId],
      );

      expect((await incidents.get(trainer, routineId)).urgent).toBe(false);
    });

    it('keeps other barns and grooms out', async () => {
      await expect(
        incidents.refer(otherTrainer, routineId, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        incidents.resolve(otherTrainer, routineId, { resolution: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(incidents.get(otherGroom, routineId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        incidents.get(otherTrainer, routineId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 for a missing incident', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(
        incidents.refer(trainer, missing, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(incidents.get(vet, missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, now())`,
        [outside, groomId],
      );
      await incidents.report(groom, { horseId: gio, description: 'A' });
      await incidents.report(groom, { horseId: outside, description: 'B' });
      await incidents.report(groom, {
        horseId: gio,
        description: 'C',
        urgent: true,
      });
    });

    const descriptions = async (actor: Actor, query = page()) =>
      (await incidents.list(actor, query)).items.map(
        (item) => item.description,
      );

    it('shows everything to the manager and vet, newest first', async () => {
      expect(await descriptions(manager)).toEqual(['C', 'B', 'A']);
      expect(await descriptions(vet)).toEqual(['C', 'B', 'A']);
    });

    it('shows a trainer only the barn horses', async () => {
      expect(await descriptions(trainer)).toEqual(['C', 'A']);
      expect(await descriptions(otherTrainer)).toEqual(['B']);
    });

    it('shows a groom only what they reported', async () => {
      expect(await descriptions(groom)).toEqual(['C', 'B', 'A']);
      expect(await descriptions(otherGroom)).toEqual([]);
    });

    it('filters by status and horse and attaches exam requests', async () => {
      const query = Object.assign(page(), {
        horseId: gio,
        status: IncidentStatus.OPEN,
      });
      const result = await incidents.list(manager, query);
      expect(result.meta.total).toBe(2);
      expect(result.items[0].examRequest?.urgent).toBe(true);
      expect(result.items[1].examRequest).toBeNull();
    });
  });

  describe('grooms viewing incidents of horses in their care', () => {
    let reportedByOther: string;

    const descriptions = async (actor: Actor) =>
      (await incidents.list(actor, page())).items.map(
        (item) => item.description,
      );

    beforeEach(async () => {
      reportedByOther = (
        await incidents.report(otherGroom, {
          horseId: gio,
          description: 'Móng xước',
        })
      ).id;
    });

    it('shows the groom in charge an incident another groom reported', async () => {
      expect(await descriptions(groom)).toEqual(['Móng xước']);
      expect((await incidents.get(groom, reportedByOther)).id).toBe(
        reportedByOther,
      );
    });

    it('keeps only their own reports for a groom after the horse moves to another groom', async () => {
      const own = await incidents.report(groom, {
        horseId: gio,
        description: 'Bỏ ăn',
      });
      const otherGroomId = (await incidents.get(otherGroom, reportedByOther))
        .reporter.id;
      await dataSource.query(
        'UPDATE groom_assignments SET end_at = now() WHERE horse_id = $1',
        [gio],
      );
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, now())`,
        [gio, otherGroomId],
      );
      const thirdGroom = await actorOf(
        await seed.user(UserRole.GROOM),
        UserRole.GROOM,
      );
      const later = await incidents.report(thirdGroom, {
        horseId: gio,
        description: 'Ho khan',
      });

      expect(await descriptions(groom)).toEqual(['Bỏ ăn']);
      expect((await incidents.get(groom, own.id)).id).toBe(own.id);
      await expect(incidents.get(groom, later.id)).rejects.toThrow(
        'Chỉ xem được sự cố bạn báo hoặc của ngựa bạn đang phụ trách',
      );
      expect(await descriptions(otherGroom)).toEqual([
        'Ho khan',
        'Bỏ ăn',
        'Móng xước',
      ]);
    });

    it('keeps out a groom who neither reported nor cares for the horse', async () => {
      const outsider = await actorOf(
        await seed.user(UserRole.GROOM),
        UserRole.GROOM,
      );

      expect(await descriptions(outsider)).toEqual([]);
      await expect(
        incidents.get(outsider, reportedByOther),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not let the groom in charge refer or resolve', async () => {
      await expect(
        incidents.refer(groom, reportedByOther, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        incidents.resolve(groom, reportedByOther, { resolution: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reminding stale incidents', () => {
    const reminders = () =>
      new IncidentRemindersService(new DomainEventPublisher(), dataSource);
    const now = new Date();
    const ageHours = (id: string, hours: number) =>
      dataSource.query('UPDATE incidents SET created_at = $2 WHERE id = $1', [
        id,
        new Date(now.getTime() - hours * 3_600_000),
      ]);

    it('reminds once about a routine incident left open for 4 hours', async () => {
      const stale = await incidents.report(groom, {
        horseId: gio,
        description: 'Bỏ ăn',
      });
      const fresh = await incidents.report(groom, {
        horseId: gio,
        description: 'Mới báo',
      });
      await ageHours(stale.id, 5);
      await ageHours(fresh.id, 3);

      expect(await reminders().remindStale(now)).toBe(1);
      expect(await reminders().remindStale(now)).toBe(0);
      const events = await outbox(INCIDENT_STALE_EVENT);
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        incidentId: stale.id,
        hours: 5,
      });
    });

    it('skips incidents already referred, resolved or urgent', async () => {
      const referred = await incidents.report(groom, {
        horseId: gio,
        description: 'Đã chuyển',
      });
      await incidents.refer(trainer, referred.id, {});
      const resolved = await incidents.report(groom, {
        horseId: gio,
        description: 'Đã xong',
      });
      await incidents.resolve(trainer, resolved.id, { resolution: 'Ổn' });
      const urgent = await incidents.report(groom, {
        horseId: gio,
        description: 'Khẩn',
        urgent: true,
      });
      for (const id of [referred.id, resolved.id, urgent.id]) {
        await ageHours(id, 10);
      }

      expect(await reminders().remindStale(now)).toBe(0);
    });
  });

  describe('closing when the horse leaves the club', () => {
    it('counts and closes only the open incidents of that horse', async () => {
      const open = await incidents.report(groom, {
        horseId: gio,
        description: 'Bỏ ăn',
      });
      const done = await incidents.report(groom, {
        horseId: gio,
        description: 'Đã xong',
      });
      await incidents.resolve(trainer, done.id, { resolution: 'Ổn' });
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, now())`,
        [outside, groomId],
      );
      const other = await incidents.report(groom, {
        horseId: outside,
        description: 'Khu khác',
      });

      const impact = await new HorseStatusesRepository().lifecycleImpact(
        dataSource.manager,
        gio,
      );
      expect(impact.openIncidents).toBe(1);

      const closed = await dataSource.transaction((tx) =>
        new IncidentWritesService().closeOpenIncidentsByHorse(
          tx,
          gio,
          'Ngựa đã chuyển nhượng',
        ),
      );

      expect(closed).toBe(1);
      expect(
        (await outbox(INCIDENT_HANDLED_EVENT)).map(
          ({ payload }) => payload.incidentId,
        ),
      ).toEqual([done.id]);
      expect(await incidents.get(manager, open.id)).toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolution: 'Ngựa đã chuyển nhượng',
        resolver: null,
        resolvedBySystem: true,
        resolvedAt: expect.any(Date) as unknown,
      });
      expect(await incidents.get(manager, done.id)).toMatchObject({
        resolution: 'Ổn',
        resolvedBySystem: false,
      });
      expect((await incidents.get(manager, other.id)).status).toBe(
        IncidentStatus.OPEN,
      );
    });
  });

  const auditsOf = (entityId: string) =>
    dataSource.query<
      Array<{
        actor_id: string | null;
        action: string;
        entity_type: string;
        before_data: Record<string, unknown> | null;
        after_data: Record<string, unknown> | null;
        reason: string | null;
        feature: string | null;
      }>
    >(
      `SELECT actor_id, action, entity_type, before_data, after_data, reason, feature
         FROM audit_logs WHERE entity_id = $1 ORDER BY created_at, id`,
      [entityId],
    );

  describe('audit trail', () => {
    it('logs reporting and resolving an incident', async () => {
      const reported = await incidents.report(groom, {
        horseId: gio,
        description: 'Bỏ ăn một bữa',
      });
      await incidents.resolve(trainer, reported.id, {
        resolution: 'Đã ăn lại',
      });

      const rows = await auditsOf(reported.id);
      expect(
        rows.map((row) => [
          row.actor_id === groomId,
          row.action,
          row.before_data,
          row.after_data,
          row.reason,
        ]),
      ).toEqual([
        [
          true,
          'CREATE',
          null,
          {
            horseId: gio,
            description: 'Bỏ ăn một bữa',
            photoMediaId: null,
            urgent: false,
            examRequestId: null,
          },
          null,
        ],
        [
          false,
          'UPDATE',
          { status: 'OPEN' },
          { status: 'RESOLVED' },
          'Đã ăn lại',
        ],
      ]);
      expect(rows.every((row) => row.feature === 'INCIDENT')).toBe(true);
    });

    it('logs referring an incident to a vet with the exam request', async () => {
      const reported = await incidents.report(groom, {
        horseId: gio,
        description: 'Móng bị xước',
      });

      const referred = await incidents.refer(trainer, reported.id, {
        urgent: true,
      });

      const rows = await auditsOf(reported.id);
      expect(rows[1]).toMatchObject({
        action: 'UPDATE',
        before_data: { examRequestId: null },
        after_data: { examRequestId: referred.examRequest?.id, urgent: true },
      });
    });
  });
});

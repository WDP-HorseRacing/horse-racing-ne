import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditFeature } from '../../src/modules/audit/constants/audit-feature.enum';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { ExamRequestStatus } from '../../src/modules/medical/constants/exam-request.enum';
import {
  MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
  MEDICAL_EXAM_REQUEST_REOPENED_EVENT,
} from '../../src/modules/medical/constants/medical-events.constants';
import { MedicalExamRequestEntity } from '../../src/modules/medical/entities/medical-exam-request.entity';
import { ExamRequestsService } from '../../src/modules/medical/exam-requests/exam-requests.service';
import { MedicalVisitWritesService } from '../../src/modules/medical/medical-records/medical-visit-writes.service';
import { ExamRequestWritesService } from '../../src/modules/medical/shared/exam-request-writes.service';
import { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import type { TrainingLockWritesService } from '../../src/modules/medical/shared/training-lock-writes.service';
import type {
  ExamRequestHandledEvent,
  ExamRequestReopenedEvent,
} from '../../src/modules/medical/types/medical-events.types';
import { IncidentStatus } from '../../src/modules/stable/constants/incident-status.enum';
import { INCIDENT_HANDLED_EVENT } from '../../src/modules/stable/constants/stable-events.constants';
import { IncidentEntity } from '../../src/modules/stable/entities/incident.entity';
import { IncidentExamRequestListener } from '../../src/modules/stable/incidents/incident-exam-request.listener';
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

describe('Closing an incident when the vet handles its exam request (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let incidents: IncidentsService;
  let examRequests: ExamRequestsService;
  let visits: MedicalVisitWritesService;
  let listener: IncidentExamRequestListener;
  let trainer: Actor;
  let groom: Actor;
  let vet: Actor;
  let vetId: string;
  let gio: string;

  const media = {
    assertAttachableIncidentPhoto: jest.fn().mockResolvedValue(undefined),
    signDownloadUrls: jest.fn(() => Promise.resolve(new Map())),
  };

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const handledEvents = async () =>
    (
      await dataSource.query<{ payload: ExamRequestHandledEvent }[]>(
        'SELECT payload FROM outbox_events WHERE event_name = $1 ORDER BY created_at',
        [MEDICAL_EXAM_REQUEST_HANDLED_EVENT],
      )
    ).map((row) => row.payload);

  const incidentRow = async (id: string) => {
    const [row] = await dataSource.query<
      {
        status: string;
        resolution: string | null;
        resolved_by: string | null;
        resolved_at: Date | null;
        resolution_source: string | null;
      }[]
    >(
      'SELECT status, resolution, resolved_by, resolved_at, resolution_source FROM incidents WHERE id = $1',
      [id],
    );
    return row;
  };

  const incidentAudits = (id: string) =>
    dataSource.query<
      {
        actor_id: string;
        before_data: unknown;
        after_data: unknown;
        reason: string;
        feature: string;
      }[]
    >(
      `SELECT actor_id, before_data, after_data, reason, feature
         FROM audit_logs WHERE entity_id = $1 AND action = 'UPDATE' ORDER BY created_at`,
      [id],
    );

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const horseAccess = new HorseAccessService(dataSource);
    const events = new DomainEventPublisher();
    examRequests = new ExamRequestsService(
      dataSource,
      dataSource.getRepository(MedicalExamRequestEntity),
      new MedicalAccessService(horseAccess, dataSource),
      horseAccess,
      new AuditService(),
      events,
    );
    incidents = new IncidentsService(
      dataSource.getRepository(IncidentEntity),
      new StableAccessService(horseAccess),
      horseAccess,
      media as unknown as MediaService,
      examRequests,
      events,
      dataSource,
      new AuditService(),
    );
    visits = new MedicalVisitWritesService(
      {} as MedicalAccessService,
      {} as TrainingLockWritesService,
      new ExamRequestWritesService(),
      new AuditService(),
      events,
    );
    listener = new IncidentExamRequestListener(incidents);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const groomId = await seed.user(UserRole.GROOM);
    vetId = await seed.user(UserRole.VETERINARIAN);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    groom = await actorOf(groomId, UserRole.GROOM);
    vet = await actorOf(vetId, UserRole.VETERINARIAN);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    gio = await seed.horse('Gió', { barnId: barn });
  });

  it('closes an urgent incident when the vet dismisses its exam request, once', async () => {
    const reported = await incidents.report(groom, {
      horseId: gio,
      description: 'Nằm lăn, bỏ ăn',
      urgent: true,
    });

    await examRequests.dismiss(vet, reported.examRequest!.id, {
      reason: 'Ngựa đã ổn',
    });
    const [event] = await handledEvents();
    expect(event).toMatchObject({
      incidentId: reported.id,
      outcome: ExamRequestStatus.DISMISSED,
      handledBy: vetId,
    });
    await listener.handle(event);
    await listener.handle(event);

    const incident = await incidentRow(reported.id);
    expect(incident).toEqual({
      status: IncidentStatus.RESOLVED,
      resolution: 'Bác sĩ đã bỏ qua yêu cầu khám',
      resolved_by: vetId,
      resolved_at: new Date(event.handledAt),
      resolution_source: 'EXAM',
    });
    expect(await incidentAudits(reported.id)).toEqual([
      {
        actor_id: vetId,
        before_data: { status: IncidentStatus.OPEN },
        after_data: { status: IncidentStatus.RESOLVED },
        reason: 'Bác sĩ đã bỏ qua yêu cầu khám',
        feature: AuditFeature.INCIDENT,
      },
    ]);
    await expect(
      dataSource.query(
        'SELECT count(*)::int AS count FROM outbox_events WHERE event_name = $1',
        [INCIDENT_HANDLED_EVENT],
      ),
    ).resolves.toEqual([{ count: 0 }]);
  });

  it('closes a referred incident when the vet examines the horse', async () => {
    const reported = await incidents.report(groom, {
      horseId: gio,
      description: 'Móng xước',
    });
    const referred = await incidents.refer(trainer, reported.id, {});
    const recordId = await seed.visit(gio, vetId, '2026-10-20T03:00:00Z');
    await dataSource.transaction(async (manager) => {
      const request = await manager.findOneByOrFail(MedicalExamRequestEntity, {
        id: referred.examRequest!.id,
      });
      await visits.markRequestsExamined(
        manager,
        {
          requests: [request],
          callerId: vetId,
          feature: AuditFeature.MED_VISIT,
        },
        recordId,
      );
    });

    const [event] = await handledEvents();
    await listener.handle(event);

    await expect(incidentRow(reported.id)).resolves.toMatchObject({
      status: IncidentStatus.RESOLVED,
      resolution: 'Bác sĩ đã khám',
      resolved_by: vetId,
      resolution_source: 'EXAM',
    });
  });

  it('leaves an incident the trainer already closed, and ignores requests not from an incident', async () => {
    const reported = await incidents.report(groom, {
      horseId: gio,
      description: 'Móng xước',
    });
    await incidents.resolve(trainer, reported.id, {
      resolution: 'Đã sát trùng',
    });
    const base = {
      eventId: randomUUID(),
      horseId: gio,
      requestId: randomUUID(),
      requestedBy: vetId,
      outcome: ExamRequestStatus.EXAMINED,
      description: 'x',
      dismissReason: null,
      handledBy: vetId,
      handledAt: new Date().toISOString(),
    } satisfies Omit<ExamRequestHandledEvent, 'incidentId'>;

    await listener.handle({ ...base, incidentId: reported.id });
    await listener.handle({ ...base, incidentId: null });

    await expect(incidentRow(reported.id)).resolves.toMatchObject({
      resolution: 'Đã sát trùng',
    });
    expect(await incidentAudits(reported.id)).toHaveLength(1);
  });

  describe('the trainer closing an incident by hand', () => {
    const waiting =
      'Sự cố đang chờ bác sĩ khám, sẽ tự đóng khi bác sĩ xử lý xong';

    it('refuses while its exam request waits for the vet, but the lifecycle change still closes it', async () => {
      const reported = await incidents.report(groom, {
        horseId: gio,
        description: 'Nằm lăn',
        urgent: true,
      });

      await expect(
        incidents.resolve(trainer, reported.id, { resolution: 'Ổn' }),
      ).rejects.toThrow(new ConflictException(waiting));
      await dataSource.transaction((manager) =>
        new IncidentWritesService().closeOpenIncidentsByHorse(
          manager,
          gio,
          'Ngựa đã mất',
        ),
      );
      await expect(incidentRow(reported.id)).resolves.toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolution: 'Ngựa đã mất',
      });
    });

    it('waits for a vet handling the request at the same moment, then closes', async () => {
      const reported = await incidents.report(groom, {
        horseId: gio,
        description: 'Nằm lăn',
        urgent: true,
      });
      const vetTx = dataSource.createQueryRunner();
      await vetTx.connect();
      await vetTx.startTransaction();
      await vetTx.query(
        `UPDATE medical_exam_requests SET status = 'DISMISSED', dismiss_reason = 'Ổn', handled_by = $1, handled_at = now() WHERE incident_id = $2`,
        [vetId, reported.id],
      );
      const closing = incidents.resolve(trainer, reported.id, {
        resolution: 'Đã xem lại',
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await vetTx.commitTransaction();
      await vetTx.release();

      await expect(closing).resolves.toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolution: 'Đã xem lại',
      });
    });
  });

  describe('the vet voiding the visit that examined the request', () => {
    const examine = async (requestId: string) => {
      const recordId = await seed.visit(gio, vetId, '2026-10-20T03:00:00Z');
      await dataSource.transaction(async (manager) => {
        const request = await manager.findOneByOrFail(
          MedicalExamRequestEntity,
          { id: requestId },
        );
        await visits.markRequestsExamined(
          manager,
          {
            requests: [request],
            callerId: vetId,
            feature: AuditFeature.MED_VISIT,
          },
          recordId,
        );
      });
      return recordId;
    };

    const voidVisit = (recordId: string) =>
      dataSource.transaction((manager) =>
        visits.reopenRequests(manager, {
          recordId,
          callerId: vetId,
          reason: 'Ghi nhầm ngựa',
          duplicateReason: 'Trùng cảnh báo',
          feature: AuditFeature.MED_VISIT,
        }),
      );

    const reopenedEvents = async () =>
      (
        await dataSource.query<{ payload: ExamRequestReopenedEvent }[]>(
          'SELECT payload FROM outbox_events WHERE event_name = $1 ORDER BY created_at',
          [MEDICAL_EXAM_REQUEST_REOPENED_EVENT],
        )
      ).map((row) => row.payload);

    const urgentIncident = () =>
      incidents.report(groom, {
        horseId: gio,
        description: 'Nằm lăn',
        urgent: true,
      });

    it('reopens the incident it closed by itself, once, and a stale close does not shut it again', async () => {
      const reported = await urgentIncident();
      const recordId = await examine(reported.examRequest!.id);
      const [closed] = await handledEvents();
      await listener.handle(closed);

      await voidVisit(recordId);
      const [reopened] = await reopenedEvents();
      expect(reopened).toMatchObject({
        incidentId: reported.id,
        requestId: reported.examRequest!.id,
        reopenedBy: vetId,
        reason: 'Ghi nhầm ngựa',
      });
      await listener.handleReopened(reopened);
      await listener.handleReopened(reopened);
      await listener.handle(closed);

      await expect(incidentRow(reported.id)).resolves.toEqual({
        status: IncidentStatus.OPEN,
        resolution: null,
        resolved_by: null,
        resolved_at: null,
        resolution_source: null,
      });
      const audits = await incidentAudits(reported.id);
      expect(audits.map((row) => [row.before_data, row.after_data])).toEqual([
        [{ status: IncidentStatus.OPEN }, { status: IncidentStatus.RESOLVED }],
        [
          {
            status: IncidentStatus.RESOLVED,
            resolution: 'Bác sĩ đã khám',
            resolvedBy: vetId,
          },
          { status: IncidentStatus.OPEN },
        ],
      ]);
      expect(audits[1]).toMatchObject({
        actor_id: vetId,
        reason: 'Ghi nhầm ngựa',
        feature: AuditFeature.INCIDENT,
      });

      await examine(reported.examRequest!.id);
      const [, again] = await handledEvents();
      await listener.handle(again);
      await expect(incidentRow(reported.id)).resolves.toMatchObject({
        status: IncidentStatus.RESOLVED,
      });
    });

    it('keeps an incident the trainer closed by hand or the lifecycle change closed', async () => {
      const byHand = await incidents.report(groom, {
        horseId: gio,
        description: 'Móng xước',
      });
      const referred = await incidents.refer(trainer, byHand.id, {});
      const handRecord = await examine(referred.examRequest!.id);
      await incidents.resolve(trainer, byHand.id, {
        resolution: 'Đã sát trùng',
      });
      const byLifecycle = await urgentIncident();
      const lifecycleRecord = await examine(byLifecycle.examRequest!.id);
      await dataSource.transaction((manager) =>
        new IncidentWritesService().closeOpenIncidentsByHorse(
          manager,
          gio,
          'Ngựa đã mất',
        ),
      );

      await voidVisit(handRecord);
      await voidVisit(lifecycleRecord);
      for (const event of await reopenedEvents()) {
        await listener.handleReopened(event);
      }

      await expect(incidentRow(byHand.id)).resolves.toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolution: 'Đã sát trùng',
        resolution_source: 'HEAD_TRAINER',
      });
      await expect(incidentRow(byLifecycle.id)).resolves.toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolution: 'Ngựa đã mất',
        resolution_source: 'LIFECYCLE',
      });
    });
  });
});

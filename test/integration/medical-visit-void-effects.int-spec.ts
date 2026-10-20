import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseHealthStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { MEDICAL_HEALTH_CHANGED_EVENT } from '../../src/modules/medical/constants/medical-events.constants';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import type { HealthChangedEvent } from '../../src/modules/medical/types/medical-events.types';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { ParticipantEligibilityListener } from '../../src/modules/training/training-sessions/participant-eligibility.listener';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const HOUR = 3_600_000;

describe('MedicalVisitsService.voidVisit effects on requests and health (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let service: MedicalVisitsService;
  let listener: ParticipantEligibilityListener;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        MedicalRecordsModule,
      ],
    }).compile();
    service = moduleRef.get(MedicalVisitsService);
    listener = new ParticipantEligibilityListener(
      dataSource,
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  const newVet = async (): Promise<{ id: string; actor: Actor }> => {
    const id = await seed.user(UserRole.VETERINARIAN);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return {
      id,
      actor: { sub: row.keycloak_id, roles: [UserRole.VETERINARIAN] },
    };
  };

  const routine = (
    author: Actor,
    horse: string,
    healthStatus?: HorseHealthStatus,
  ) =>
    service.createStandaloneVisit(author, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      ...(healthStatus ? { healthStatus, healthReason: 'Khám thấy' } : {}),
    });

  const healthOf = async (horse: string) => {
    const [row] = await dataSource.query<{ health_status: string }[]>(
      'SELECT health_status FROM horses WHERE id = $1',
      [horse],
    );
    return row.health_status;
  };

  const requestRow = (id: string) =>
    dataSource
      .query<Record<string, unknown>[]>(
        `SELECT status, medical_record_id, handled_by, handled_at, dismiss_reason
           FROM medical_exam_requests WHERE id = $1`,
        [id],
      )
      .then((rows) => rows[0]);

  const healthEvents = () =>
    dataSource
      .query<{ payload: HealthChangedEvent }[]>(
        'SELECT payload FROM outbox_events WHERE event_name = $1 ORDER BY created_at',
        [MEDICAL_HEALTH_CHANGED_EVENT],
      )
      .then((rows) => rows.map((row) => row.payload));

  it('stores the health of the horse before the visit on every new visit', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');

    const visit = await routine(vet.actor, horse, HorseHealthStatus.INJURED);

    const [row] = await dataSource.query<
      { health_before: string; resulting_status: string }[]
    >(
      'SELECT health_before, resulting_status FROM medical_records WHERE id = $1',
      [visit.id],
    );
    expect(row).toEqual({
      health_before: HorseHealthStatus.ELIGIBLE,
      resulting_status: HorseHealthStatus.INJURED,
    });
  });

  it('returns the requests the voided visit examined to the queue, unlinked, and audits each one', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const request = await seed.examRequest(horse);
    const visit = await service.createStandaloneVisit(vet.actor, horse, {
      kind: MedicalVisitKind.REQUEST,
      conclusion: MedicalVisitConclusion.NORMAL,
      requestIds: [request],
    });

    await service.voidVisit(vet.actor, visit.id, { reason: 'Nhầm ngựa' });

    expect(await requestRow(request)).toEqual({
      status: 'PENDING',
      medical_record_id: null,
      handled_by: null,
      handled_at: null,
      dismiss_reason: null,
    });
    const audits = await dataSource.query<Record<string, unknown>[]>(
      `SELECT before_data, after_data, reason FROM audit_logs
        WHERE entity_type = 'MEDICAL_EXAM_REQUEST' AND entity_id = $1
        ORDER BY created_at, after_data->>'status'`,
      [request],
    );
    expect(audits).toContainEqual({
      before_data: { status: 'EXAMINED', medicalRecordId: visit.id },
      after_data: { status: 'PENDING', medicalRecordId: null },
      reason: 'Nhầm ngựa',
    });
  });

  it('dismisses an old alert request instead of reopening it when the horse already has a pending request of the same alert', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const examined = randomUUID();
    await dataSource.query(
      `INSERT INTO medical_exam_requests (id, version, horse_id, source, urgent, description, status, alert_type)
       VALUES ($1, 1, $2, 'MEASUREMENT_ALERT', false, 'Sốt', 'PENDING', 'FEVER')`,
      [examined, horse],
    );
    const visit = await service.createStandaloneVisit(vet.actor, horse, {
      kind: MedicalVisitKind.REQUEST,
      conclusion: MedicalVisitConclusion.NORMAL,
      requestIds: [examined],
    });
    const pending = randomUUID();
    await dataSource.query(
      `INSERT INTO medical_exam_requests (id, version, horse_id, source, urgent, description, status, alert_type)
       VALUES ($1, 1, $2, 'MEASUREMENT_ALERT', false, 'Sốt lại', 'PENDING', 'FEVER')`,
      [pending, horse],
    );

    await service.voidVisit(vet.actor, visit.id, { reason: 'Nhầm ngựa' });

    expect(await requestRow(examined)).toMatchObject({
      status: 'DISMISSED',
      medical_record_id: null,
      handled_by: vet.id,
      dismiss_reason:
        'Buổi khám bị hủy, ngựa đã có yêu cầu đang chờ cùng loại cảnh báo',
    });
    expect((await requestRow(pending)).status).toBe('PENDING');
  });

  it('lets a voided request visit be recorded again against the same request', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const request = await seed.examRequest(horse);
    const first = await service.createStandaloneVisit(vet.actor, horse, {
      kind: MedicalVisitKind.REQUEST,
      conclusion: MedicalVisitConclusion.NORMAL,
      requestIds: [request],
    });
    await service.voidVisit(vet.actor, first.id, { reason: 'Sai thân nhiệt' });

    const second = await service.createStandaloneVisit(vet.actor, horse, {
      kind: MedicalVisitKind.REQUEST,
      conclusion: MedicalVisitConclusion.NORMAL,
      requestIds: [request],
      replacesRecordId: first.id,
    });

    expect(await requestRow(request)).toMatchObject({
      status: 'EXAMINED',
      medical_record_id: second.id,
    });
  });

  it('reverts the health the visit changed when nothing changed it since, and the upcoming runs are re-evaluated', async () => {
    const vet = await newVet();
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const horse = await seed.horse('Winx');
    const { classId } = await seed.trainingClass(trainer, {
      startDate: '2020-01-01',
      endDate: '2099-12-31',
    });
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2020-01-01T00:00:00Z')`,
      [enrollmentId, classId, horse],
    );
    const sessionId = randomUUID();
    const start = new Date(Date.now() + 48 * HOUR);
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3, $4, 'SCHEDULED', 'HEAVY', 3000)`,
      [sessionId, classId, start, new Date(start.getTime() + HOUR)],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES ($1, 1, $2, $3, $4, 'PLANNED')`,
      [participantId, sessionId, horse, enrollmentId],
    );
    const participantStatus = async () => {
      const [row] = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM session_participants WHERE id = $1',
        [participantId],
      );
      return row.status;
    };
    const visit = await routine(vet.actor, horse, HorseHealthStatus.INJURED);
    for (const event of await healthEvents()) await listener.handle(event);
    const statusWhileInjured = await participantStatus();

    const result = await service.voidVisit(vet.actor, visit.id, {
      reason: 'Nhầm ngựa',
    });

    expect(result).toMatchObject({
      healthOutcome: 'REVERTED',
      laterHealthChange: null,
    });
    expect(await healthOf(horse)).toBe(HorseHealthStatus.ELIGIBLE);
    const [audit] = await dataSource.query<Record<string, unknown>[]>(
      `SELECT before_data, after_data, reason FROM audit_logs
        WHERE entity_type = 'HORSE' AND entity_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [horse],
    );
    expect(audit).toEqual({
      before_data: { healthStatus: HorseHealthStatus.INJURED },
      after_data: { healthStatus: HorseHealthStatus.ELIGIBLE },
      reason: 'Hủy buổi khám: Nhầm ngựa',
    });
    const events = await healthEvents();
    expect(events[events.length - 1]).toMatchObject({
      horseId: horse,
      from: HorseHealthStatus.INJURED,
      to: HorseHealthStatus.ELIGIBLE,
    });
    await listener.handle(events[events.length - 1]);
    expect(statusWhileInjured).toBe('INELIGIBLE');
    expect(await participantStatus()).toBe('PLANNED');
  });

  it('keeps the current health and names the later change when the health changed after the visit', async () => {
    const vet = await newVet();
    const other = await newVet();
    const horse = await seed.horse('Winx');
    const first = await routine(vet.actor, horse, HorseHealthStatus.INJURED);
    await routine(other.actor, horse, HorseHealthStatus.QUARANTINED);
    const eventsBefore = (await healthEvents()).length;

    const result = await service.voidVisit(vet.actor, first.id, {
      reason: 'Nhầm ngựa',
    });

    expect(result).toMatchObject({
      healthOutcome: 'KEPT_LATER_CHANGE',
      laterHealthChange: {
        changedBy: other.id,
        to: HorseHealthStatus.QUARANTINED,
      },
    });
    expect(await healthOf(horse)).toBe(HorseHealthStatus.QUARANTINED);
    expect(await healthEvents()).toHaveLength(eventsBefore);
  });

  it('keeps the current health for a visit recorded before the health before was stored', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx', {
      health: HorseHealthStatus.INJURED,
    });
    const visitId = await seed.visit(horse, vet.id, new Date().toISOString());

    const result = await service.voidVisit(vet.actor, visitId, {
      reason: 'Nhầm ngựa',
    });

    expect(result.healthOutcome).toBe('UNKNOWN_BEFORE');
    expect(await healthOf(horse)).toBe(HorseHealthStatus.INJURED);
  });
});

import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseMeasurementType } from '../../src/modules/horses/enums/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../../src/modules/medical/constants/injury-marker.enum';
import {
  MEDICAL_CASE_CANCELLED_EVENT,
  MEDICAL_CASE_OPENED_EVENT,
  MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
  MEDICAL_HEALTH_CHANGED_EVENT,
} from '../../src/modules/medical/constants/medical-events.constants';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import type { UpdateMedicalVisitDto } from '../../src/modules/medical/dto';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitEditsService } from '../../src/modules/medical/medical-records/medical-visit-edits.service';
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

describe('MedicalVisitEditsService.editVisit (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let visits: MedicalVisitsService;
  let edits: MedicalVisitEditsService;
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
    visits = moduleRef.get(MedicalVisitsService);
    edits = moduleRef.get(MedicalVisitEditsService);
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

  const edit = (
    author: Actor,
    id: string,
    body: Partial<UpdateMedicalVisitDto>,
  ) => edits.editVisit(author, id, { reason: 'Gõ nhầm', ...body });

  const routine = (author: Actor, horse: string, extra = {}) =>
    visits.createStandaloneVisit(author, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      ...extra,
    });

  const sprain = (x: number) => ({
    bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
    injuryType: InjuryType.SPRAIN,
    recoveryStatus: RecoveryStatus.ACUTE,
    position: { x, y: 0.4, z: 0 },
  });

  const issue = (author: Actor, horse: string, extra = {}) =>
    visits.createStandaloneVisit(author, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.ISSUE,
      initialDiagnosis: 'Viêm gân',
      ...extra,
    });

  const row = async (sql: string, params: unknown[]) =>
    (await dataSource.query<Record<string, unknown>[]>(sql, params))[0];

  const outbox = async (name: string) =>
    (
      await dataSource.query<{ payload: Record<string, unknown> }[]>(
        'SELECT payload FROM outbox_events WHERE event_name = $1 ORDER BY created_at',
        [name],
      )
    ).map((item) => item.payload);

  const visitAudits = (id: string) =>
    dataSource.query<Record<string, unknown>[]>(
      `SELECT before_data, after_data, reason FROM audit_logs
        WHERE entity_type = 'MEDICAL_RECORD' AND entity_id = $1 AND action = 'UPDATE'`,
      [id],
    );

  const healthOf = async (horse: string) =>
    (await row('SELECT health_status FROM horses WHERE id = $1', [horse]))
      .health_status;

  describe('access', () => {
    it('forbids another vet and refuses a deceased horse', async () => {
      const vet = await newVet();
      const other = await newVet();
      const horse = await seed.horse('Winx');
      const visit = await routine(vet.actor, horse);

      await expect(
        edit(other.actor, visit.id, { diagnosis: 'x' }),
      ).rejects.toMatchObject({ status: 403 });
      await dataSource.query(
        `UPDATE horses SET lifecycle_status = $2 WHERE id = $1`,
        [horse, HorseLifecycleStatus.DECEASED],
      );
      await expect(
        edit(vet.actor, visit.id, { diagnosis: 'x' }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await visitAudits(visit.id)).toEqual([]);
    });
  });

  describe('text fields', () => {
    it('updates and clears text, bumps the version and audits only the changed parts once', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const visit = await routine(vet.actor, horse, {
        diagnosis: 'Ổn',
        careInstructions: 'Nghỉ 2 ngày',
      });

      const result = await edit(vet.actor, visit.id, {
        diagnosis: 'Viêm nhẹ',
        careInstructions: null,
      });

      expect(result).toMatchObject({
        diagnosis: 'Viêm nhẹ',
        careInstructions: null,
        healthOutcome: 'UNCHANGED',
      });
      expect(
        await row('SELECT version FROM medical_records WHERE id = $1', [
          visit.id,
        ]),
      ).toEqual({ version: 2 });
      expect(await visitAudits(visit.id)).toEqual([
        {
          before_data: { diagnosis: 'Ổn', careInstructions: 'Nghỉ 2 ngày' },
          after_data: { diagnosis: 'Viêm nhẹ', careInstructions: null },
          reason: 'Gõ nhầm',
        },
      ]);
    });

    it('keeps both of two concurrent edits', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const visit = await routine(vet.actor, horse);

      await Promise.all([
        edit(vet.actor, visit.id, { diagnosis: 'A' }),
        edit(vet.actor, visit.id, { careInstructions: 'B' }),
      ]);

      expect(
        await row(
          'SELECT diagnosis, care_instructions, version FROM medical_records WHERE id = $1',
          [visit.id],
        ),
      ).toEqual({ diagnosis: 'A', care_instructions: 'B', version: 3 });
    });
  });

  describe('health', () => {
    it('changes the horse health when nothing changed it since, re-evaluates runs, and a later void returns to the health before the visit', async () => {
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
      const visit = await routine(vet.actor, horse);

      const result = await edit(vet.actor, visit.id, {
        healthStatus: HorseHealthStatus.INJURED,
      });

      expect(result).toMatchObject({
        resultingStatus: HorseHealthStatus.INJURED,
        healthOutcome: 'UPDATED',
      });
      expect(await healthOf(horse)).toBe(HorseHealthStatus.INJURED);
      const [event] = await outbox(MEDICAL_HEALTH_CHANGED_EVENT);
      expect(event).toMatchObject({ from: 'ELIGIBLE', to: 'INJURED' });
      await listener.handle(event as unknown as HealthChangedEvent);
      expect(
        await row('SELECT status FROM session_participants WHERE id = $1', [
          participantId,
        ]),
      ).toEqual({ status: 'INELIGIBLE' });

      const voided = await visits.voidVisit(vet.actor, visit.id, {
        reason: 'Nhầm ngựa',
      });
      expect(voided.healthOutcome).toBe('REVERTED');
      expect(await healthOf(horse)).toBe(HorseHealthStatus.ELIGIBLE);
    });

    it('only changes the visit result when the health changed after the visit', async () => {
      const vet = await newVet();
      const other = await newVet();
      const horse = await seed.horse('Winx');
      const first = await routine(vet.actor, horse, {
        healthStatus: HorseHealthStatus.INJURED,
        healthReason: 'Khám thấy',
      });
      await routine(other.actor, horse, {
        healthStatus: HorseHealthStatus.UNDER_OBSERVATION,
        healthReason: 'Đỡ',
      });
      const eventsBefore = (await outbox(MEDICAL_HEALTH_CHANGED_EVENT)).length;

      const result = await edit(vet.actor, first.id, {
        healthStatus: HorseHealthStatus.QUARANTINED,
      });

      expect(result).toMatchObject({
        resultingStatus: HorseHealthStatus.QUARANTINED,
        healthOutcome: 'KEPT_LATER_CHANGE',
        laterHealthChange: {
          changedBy: other.id,
          to: HorseHealthStatus.UNDER_OBSERVATION,
        },
      });
      expect(await healthOf(horse)).toBe(HorseHealthStatus.UNDER_OBSERVATION);
      expect(await outbox(MEDICAL_HEALTH_CHANGED_EVENT)).toHaveLength(
        eventsBefore,
      );
    });
  });

  describe('measurements', () => {
    it('edits a measurement of the visit by type and asks to confirm an abnormal value', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const visit = await routine(vet.actor, horse, {
        measurements: [{ type: HorseMeasurementType.WEIGHT, value: 450 }],
      });

      await expect(
        edit(vet.actor, visit.id, {
          measurements: [{ type: HorseMeasurementType.TEMPERATURE, value: 38 }],
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        edit(vet.actor, visit.id, {
          measurements: [{ type: HorseMeasurementType.WEIGHT, value: 1400 }],
        }),
      ).rejects.toMatchObject({ status: 422 });

      await edit(vet.actor, visit.id, {
        measurements: [{ type: HorseMeasurementType.WEIGHT, value: 455 }],
      });

      expect(
        await row(
          'SELECT value FROM horse_measurements WHERE medical_record_id = $1',
          [visit.id],
        ),
      ).toEqual({ value: '455.00' });
      expect(await visitAudits(visit.id)).toEqual([
        expect.objectContaining({
          before_data: { measurements: [{ type: 'WEIGHT', value: 450 }] },
          after_data: { measurements: [{ type: 'WEIGHT', value: 455 }] },
        }),
      ]);
    });
  });

  describe('prescriptions', () => {
    it('replaces the whole list and removes all with an empty list', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const item = {
        medicine: 'Bute',
        dosage: '2g',
        frequency: '1 lần',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
      };
      const visit = await routine(vet.actor, horse, { prescriptions: [item] });

      const replaced = await edit(vet.actor, visit.id, {
        prescriptions: [{ ...item, medicine: 'Banamine' }],
      });
      expect(replaced.prescriptions.map((p) => p.medicine)).toEqual([
        'Banamine',
      ]);
      expect(
        await row('SELECT version FROM medical_records WHERE id = $1', [
          visit.id,
        ]),
      ).toEqual({ version: 2 });
      await expect(
        edit(vet.actor, visit.id, {
          prescriptions: [{ ...item, endDate: undefined }],
        }),
      ).rejects.toMatchObject({ status: 400 });
      const cleared = await edit(vet.actor, visit.id, { prescriptions: [] });
      expect(cleared.prescriptions).toEqual([]);
    });
  });

  describe('injuries', () => {
    it('edits status, notes and position of an injury found in the visit, and deletes it when no other visit recorded it', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const visit = await issue(vet.actor, horse, {
        newInjuries: [sprain(0.1), sprain(0.2)],
      });
      const [first, second] = visit.injuries.map((item) => item.injuryId);

      const result = await edit(vet.actor, visit.id, {
        injuries: [
          {
            injuryId: first,
            recoveryStatus: RecoveryStatus.RECOVERING,
            notes: 'Sưng nhẹ',
            position: { x: 0.15, y: 0.4, z: 0 },
          },
        ],
        removedInjuryIds: [second],
      });

      expect(result.injuries).toEqual([
        expect.objectContaining({
          injuryId: first,
          recoveryStatus: RecoveryStatus.RECOVERING,
          notes: 'Sưng nhẹ',
          position: { x: 0.15, y: 0.4, z: 0 },
        }),
      ]);
      expect(
        await row('SELECT COUNT(*)::int AS n FROM injuries WHERE id = $1', [
          second,
        ]),
      ).toEqual({ n: 0 });
    });

    it('refuses to delete an injury a later visit recorded and to edit fixed info of an injury found earlier', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const opening = await issue(vet.actor, horse, {
        newInjuries: [sprain(0.1)],
      });
      const injuryId = opening.injuries[0].injuryId;
      const followUp = await visits.createFollowUpVisit(
        vet.actor,
        opening.caseId as string,
        {
          injuryUpdates: [
            { injuryId, recoveryStatus: RecoveryStatus.RECOVERING },
          ],
        },
      );

      await expect(
        edit(vet.actor, opening.id, { removedInjuryIds: [injuryId] }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        edit(vet.actor, followUp.id, {
          injuries: [{ injuryId, injuryType: InjuryType.FRACTURE }],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('exam requests and kind', () => {
    it('detaches removed requests to the queue and attaches pending ones telling their requester', async () => {
      const vet = await newVet();
      const trainer = await seed.user(UserRole.HEAD_TRAINER);
      const horse = await seed.horse('Winx');
      const kept = await seed.examRequest(horse);
      const dropped = await seed.examRequest(horse);
      const added = randomUUID();
      await dataSource.query(
        `INSERT INTO medical_exam_requests (id, version, horse_id, requested_by, source, urgent, description, status)
         VALUES ($1, 1, $2, $3, 'STAFF', false, 'Khập khiễng', 'PENDING')`,
        [added, horse, trainer],
      );
      const visit = await visits.createStandaloneVisit(vet.actor, horse, {
        kind: MedicalVisitKind.REQUEST,
        conclusion: MedicalVisitConclusion.NORMAL,
        requestIds: [kept, dropped],
      });

      await edit(vet.actor, visit.id, { requestIds: [kept, added] });

      const status = async (id: string) =>
        row(
          'SELECT status, medical_record_id FROM medical_exam_requests WHERE id = $1',
          [id],
        );
      expect(await status(kept)).toEqual({
        status: 'EXAMINED',
        medical_record_id: visit.id,
      });
      expect(await status(dropped)).toEqual({
        status: 'PENDING',
        medical_record_id: null,
      });
      expect(await status(added)).toEqual({
        status: 'EXAMINED',
        medical_record_id: visit.id,
      });
      const handled = await outbox(MEDICAL_EXAM_REQUEST_HANDLED_EVENT);
      expect(
        handled.map((event) => [event.requestId, event.requestedBy]).sort(),
      ).toEqual(
        [
          [kept, null],
          [dropped, null],
          [added, trainer],
        ].sort(),
      );
    });

    it('requires a request for a REQUEST visit after merging', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const visit = await routine(vet.actor, horse);

      await expect(
        edit(vet.actor, visit.id, { kind: MedicalVisitKind.REQUEST }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('conclusion', () => {
    it('opens a case when a NORMAL visit becomes ISSUE and cancels it when it goes back', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const visit = await routine(vet.actor, horse);

      const opened = await edit(vet.actor, visit.id, {
        conclusion: MedicalVisitConclusion.ISSUE,
        initialDiagnosis: 'Viêm gân',
      });
      expect(opened.caseId).not.toBeNull();
      expect(
        await row(
          'SELECT status, initial_diagnosis, opened_at = $2 AS opened_at_exam FROM medical_cases WHERE id = $1',
          [opened.caseId, visit.examDate],
        ),
      ).toEqual({
        status: 'OPEN',
        initial_diagnosis: 'Viêm gân',
        opened_at_exam: true,
      });
      expect(await outbox(MEDICAL_CASE_OPENED_EVENT)).toHaveLength(1);

      const back = await edit(vet.actor, visit.id, {
        conclusion: MedicalVisitConclusion.NORMAL,
      });
      expect(back.caseId).toBeNull();
      expect(
        await row('SELECT status FROM medical_cases WHERE id = $1', [
          opened.caseId,
        ]),
      ).toEqual({ status: 'CANCELLED' });
      expect(await outbox(MEDICAL_CASE_CANCELLED_EVENT)).toHaveLength(1);
    });

    it('refuses to open a case from a visit that has a later visit, or while a case is open', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const first = await routine(vet.actor, horse);
      await routine(vet.actor, horse);
      await expect(
        edit(vet.actor, first.id, {
          conclusion: MedicalVisitConclusion.ISSUE,
          initialDiagnosis: 'x',
        }),
      ).rejects.toThrow(
        'Đã có buổi khám sau buổi này, hãy ghi buổi khám mới để mở bệnh án',
      );
      await expect(
        edit(vet.actor, first.id, { conclusion: MedicalVisitConclusion.ISSUE }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('refuses to cancel a case that has another visit', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const opening = await issue(vet.actor, horse);
      await visits.createFollowUpVisit(vet.actor, opening.caseId as string, {});

      await expect(
        edit(vet.actor, opening.id, {
          conclusion: MedicalVisitConclusion.NORMAL,
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('edits the initial diagnosis of the case the visit opened', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const opening = await issue(vet.actor, horse);

      await edit(vet.actor, opening.id, { initialDiagnosis: 'Viêm khớp' });

      expect(
        await row('SELECT initial_diagnosis FROM medical_cases WHERE id = $1', [
          opening.caseId,
        ]),
      ).toEqual({ initial_diagnosis: 'Viêm khớp' });
    });
  });

  describe('closed case', () => {
    it('edits text but refuses a next visit, a new request and an unhealed injury', async () => {
      const vet = await newVet();
      const horse = await seed.horse('Winx');
      const opening = await issue(vet.actor, horse, {
        newInjuries: [
          { ...sprain(0.1), recoveryStatus: RecoveryStatus.HEALED },
        ],
      });
      await dataSource.query(
        `UPDATE medical_cases SET status = 'CLOSED', closed_at = now(), closed_by = $2, final_conclusion = 'Khỏi' WHERE id = $1`,
        [opening.caseId, vet.id],
      );
      const request = await seed.examRequest(horse);

      await expect(
        edit(vet.actor, opening.id, { diagnosis: 'Sửa chữ' }),
      ).resolves.toMatchObject({ diagnosis: 'Sửa chữ' });
      await expect(
        edit(vet.actor, opening.id, {
          nextVisitAt: new Date(Date.now() + 48 * HOUR).toISOString(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        edit(vet.actor, opening.id, {
          requestIds: [request],
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        edit(vet.actor, opening.id, {
          injuries: [
            {
              injuryId: opening.injuries[0].injuryId,
              recoveryStatus: RecoveryStatus.RECOVERING,
            },
          ],
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await row(
          'SELECT recovery_status FROM injury_markers WHERE medical_record_id = $1',
          [opening.id],
        ),
      ).toEqual({ recovery_status: RecoveryStatus.HEALED });
    });
  });
});

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditEntityType } from '../../src/modules/audit/constants/audit-entity-type.enum';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../src/modules/horses/enums/horse-measurement-alert.enum';
import { HorseMeasurementSource } from '../../src/modules/horses/enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../../src/modules/horses/enums/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { HorseMeasurementAlertEvent } from '../../src/modules/horses/types/horse.types';
import { ExamRequestStatus } from '../../src/modules/medical/constants/exam-request.enum';
import { ExamRequestListQueryDto } from '../../src/modules/medical/dto';
import { MedicalExamRequestEntity } from '../../src/modules/medical/entities/medical-exam-request.entity';
import { ExamRequestsService } from '../../src/modules/medical/exam-requests/exam-requests.service';
import { HealthStatusesRepository } from '../../src/modules/medical/health-statuses/health-statuses.repository';
import { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };
const groom: Actor = { sub: 'kc-groom', roles: [UserRole.GROOM] };

describe('Health history and exam request queries (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => truncateAll(dataSource));

  describe('HealthStatusesRepository.history', () => {
    it('keeps only real health changes of the horse, newest first', async () => {
      const winx = await seed.horse('Winx');
      const other = await seed.horse('Other');
      const actor = await seed.user(UserRole.VETERINARIAN);
      const { ELIGIBLE, INJURED, UNDER_OBSERVATION } = HorseHealthStatus;
      await seed.horseAudit(
        winx,
        { healthStatus: ELIGIBLE },
        { healthStatus: INJURED },
        '2026-09-10T02:00:00Z',
        { reason: 'Viêm gân', feature: 'F3.7', actorId: actor },
      );
      await seed.horseAudit(
        winx,
        { healthStatus: INJURED },
        { healthStatus: UNDER_OBSERVATION },
        '2026-09-20T02:00:00Z',
        { feature: 'F3.6' },
      );
      await seed.horseAudit(
        winx,
        { healthStatus: UNDER_OBSERVATION },
        { healthStatus: UNDER_OBSERVATION },
        '2026-09-21T02:00:00Z',
      );
      await seed.horseAudit(
        winx,
        { name: 'Winx' },
        { name: 'Winx II' },
        '2026-09-22T02:00:00Z',
      );
      await seed.horseAudit(
        winx,
        { healthStatus: ELIGIBLE },
        { healthStatus: INJURED },
        '2026-09-23T02:00:00Z',
        { entityType: AuditEntityType.MEDICAL_CASE },
      );
      await seed.horseAudit(
        other,
        { healthStatus: ELIGIBLE },
        { healthStatus: INJURED },
        '2026-09-24T02:00:00Z',
      );

      const rows = await new HealthStatusesRepository(dataSource).history(winx);

      expect(rows).toEqual([
        expect.objectContaining({
          changedAt: new Date('2026-09-20T02:00:00Z'),
          from: INJURED,
          to: UNDER_OBSERVATION,
          feature: 'F3.6',
        }),
        {
          changedAt: new Date('2026-09-10T02:00:00Z'),
          from: ELIGIBLE,
          to: INJURED,
          reason: 'Viêm gân',
          feature: 'F3.7',
          actorId: actor,
        },
      ]);
    });

    it('keeps the first recorded status even without a previous one', async () => {
      const winx = await seed.horse('Winx');
      await seed.horseAudit(
        winx,
        {},
        { healthStatus: HorseHealthStatus.UNDER_OBSERVATION },
        '2026-09-10T02:00:00Z',
      );

      const rows = await new HealthStatusesRepository(dataSource).history(winx);

      expect(rows).toEqual([
        expect.objectContaining({
          from: null,
          to: HorseHealthStatus.UNDER_OBSERVATION,
        }),
      ]);
    });
  });

  describe('ExamRequestsService', () => {
    let callerId: string;
    let audit: { record: jest.Mock };
    let service: ExamRequestsService;

    const listIds = async (
      actor: Actor,
      query: Partial<ExamRequestListQueryDto> = {},
    ) =>
      (
        await service.list(
          actor,
          Object.assign(new ExamRequestListQueryDto(), query),
        )
      ).items.map((item) => item.id);

    beforeEach(async () => {
      callerId = await seed.user(UserRole.GROOM);
      audit = { record: jest.fn().mockResolvedValue(undefined) };
      service = new ExamRequestsService(
        dataSource,
        dataSource.getRepository(MedicalExamRequestEntity),
        {} as MedicalAccessService,
        Object.assign(new HorseAccessService(dataSource), {
          currentUser: jest.fn().mockResolvedValue({ id: callerId }),
        }),
        audit,
        { publish: jest.fn() },
      );
    });

    describe('list', () => {
      it('shows pending requests only, urgent first, then the oldest', async () => {
        const winx = await seed.horse('Winx');
        const bolt = await seed.horse('Bolt');
        const oldNormal = await seed.examRequest(winx, {
          createdAt: '2026-09-01T02:00:00Z',
        });
        const newUrgent = await seed.examRequest(winx, {
          urgent: true,
          createdAt: '2026-09-20T02:00:00Z',
        });
        const oldUrgent = await seed.examRequest(bolt, {
          urgent: true,
          createdAt: '2026-09-05T02:00:00Z',
        });
        await seed.examRequest(winx, { status: ExamRequestStatus.EXAMINED });

        await expect(listIds(vet)).resolves.toEqual([
          oldUrgent,
          newUrgent,
          oldNormal,
        ]);
      });

      it('filters by status and urgency and pages the result', async () => {
        const winx = await seed.horse('Winx');
        const dismissed = await seed.examRequest(winx, {
          status: ExamRequestStatus.DISMISSED,
        });
        const urgent = await seed.examRequest(winx, {
          urgent: true,
          createdAt: '2026-09-01T02:00:00Z',
        });
        const secondUrgent = await seed.examRequest(winx, {
          urgent: true,
          createdAt: '2026-09-02T02:00:00Z',
        });
        await seed.examRequest(winx);

        await expect(
          listIds(vet, { status: ExamRequestStatus.DISMISSED }),
        ).resolves.toEqual([dismissed]);
        await expect(listIds(vet, { urgent: true })).resolves.toEqual([
          urgent,
          secondUrgent,
        ]);
        const page = await service.list(
          vet,
          Object.assign(new ExamRequestListQueryDto(), {
            urgent: true,
            page: 2,
            limit: 1,
          }),
        );
        expect(page.items.map((item) => item.id)).toEqual([secondUrgent]);
        expect(page.meta).toMatchObject({ total: 2 });
      });

      it('shows a groom only the requests of assigned horses', async () => {
        const mine = await seed.horse('Mine');
        const other = await seed.horse('Other');
        const kept = await seed.examRequest(mine);
        await seed.examRequest(other);
        await dataSource.query(
          `INSERT INTO groom_assignments (id, version, horse_id, groom_id, start_at)
           VALUES ($1, 1, $2, $3, now())`,
          [randomUUID(), mine, callerId],
        );

        await expect(listIds(groom)).resolves.toEqual([kept]);
        await dataSource.query('UPDATE groom_assignments SET end_at = now()');
        await expect(listIds(groom)).resolves.toEqual([]);
      });
    });

    describe('createFromAlert', () => {
      const fever = (horseId: string): HorseMeasurementAlertEvent => ({
        alert: HorseMeasurementAlert.FEVER,
        severity: HorseMeasurementAlertSeverity.URGENT,
        measurementId: randomUUID(),
        horseId,
        measuredBy: randomUUID(),
        type: HorseMeasurementType.TEMPERATURE,
        value: 39.5,
        unit: '°C',
        measuredAt: new Date().toISOString(),
        source: HorseMeasurementSource.MANUAL,
      });

      const pending = (horseId: string) =>
        dataSource.getRepository(MedicalExamRequestEntity).find({
          where: { horseId, status: ExamRequestStatus.PENDING },
        });

      it('creates one urgent pending request per horse and alert type', async () => {
        const winx = await seed.horse('Winx');

        await expect(service.createFromAlert(fever(winx))).resolves.toBe(true);
        await expect(service.createFromAlert(fever(winx))).resolves.toBe(false);

        const rows = await pending(winx);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          urgent: true,
          requestedBy: null,
          alertType: HorseMeasurementAlert.FEVER,
        });
        expect(audit.record).toHaveBeenCalledTimes(1);
      });

      it('creates a new request once the previous one is handled', async () => {
        const winx = await seed.horse('Winx');
        await service.createFromAlert(fever(winx));
        await dataSource
          .getRepository(MedicalExamRequestEntity)
          .update({ horseId: winx }, { status: ExamRequestStatus.EXAMINED });

        await expect(service.createFromAlert(fever(winx))).resolves.toBe(true);
        await expect(pending(winx)).resolves.toHaveLength(1);
      });

      it('ignores the same alert delivered again after its request was handled', async () => {
        const winx = await seed.horse('Winx');
        const alert = fever(winx);
        await service.createFromAlert(alert);
        await dataSource
          .getRepository(MedicalExamRequestEntity)
          .update({ horseId: winx }, { status: ExamRequestStatus.EXAMINED });

        await expect(service.createFromAlert(alert)).resolves.toBe(false);
        await expect(
          dataSource
            .getRepository(MedicalExamRequestEntity)
            .countBy({ horseId: winx }),
        ).resolves.toBe(1);
        expect(audit.record).toHaveBeenCalledTimes(1);
      });

      it('skips deleted and transferred horses', async () => {
        const deleted = await seed.horse('Deleted', { deleted: true });
        const transferred = await seed.horse('Transferred', {
          lifecycle: HorseLifecycleStatus.TRANSFERRED,
        });

        await expect(service.createFromAlert(fever(deleted))).resolves.toBe(
          false,
        );
        await expect(service.createFromAlert(fever(transferred))).resolves.toBe(
          false,
        );
        await expect(
          dataSource.getRepository(MedicalExamRequestEntity).count(),
        ).resolves.toBe(0);
      });
    });
  });
});

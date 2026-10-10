import {
  BadRequestException,
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
import { INCIDENT_REPORTED_EVENT } from '../../src/modules/stable/constants/stable-events.constants';
import { IncidentListQueryDto } from '../../src/modules/stable/dto/incident.dto';
import { IncidentEntity } from '../../src/modules/stable/entities/incident.entity';
import { IncidentsService } from '../../src/modules/stable/incidents/incidents.service';
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

    it('rejects a horse the groom does not care for, before checking the photo', async () => {
      media.assertAttachableIncidentPhoto.mockRejectedValueOnce(
        new BadRequestException('Tệp không phải ảnh sự cố'),
      );
      await expect(
        incidents.report(otherGroom, {
          horseId: gio,
          description: 'x',
          photoMediaId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      media.assertAttachableIncidentPhoto.mockReset();
      media.assertAttachableIncidentPhoto.mockResolvedValue(undefined);
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
    });

    it('refers once, then waits for the vet before closing', async () => {
      const referred = await incidents.refer(trainer, routineId);
      expect(referred.examRequest).toMatchObject({
        status: ExamRequestStatus.PENDING,
        urgent: false,
      });
      await expect(incidents.refer(trainer, routineId)).rejects.toBeInstanceOf(
        ConflictException,
      );
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

    it('keeps other barns and grooms out', async () => {
      await expect(
        incidents.refer(otherTrainer, routineId),
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
      await expect(incidents.refer(trainer, missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
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
});

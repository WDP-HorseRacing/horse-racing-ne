import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { UserStatus } from '../../../src/common/enums/user-status.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { KeycloakUserService } from '../../../src/common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../src/common/types/actor';
import { AuditFeature } from '../../../src/modules/audit/constants/audit-feature.enum';
import { AuditLogListQueryDto } from '../../../src/modules/audit/dto/audit-log.dto';
import { AuditLogEntity } from '../../../src/modules/audit/entities/audit-log.entity';
import { AuditLogsService } from '../../../src/modules/audit/services/audit-logs.service';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { HorseListQueryDto } from '../../../src/modules/horses/dto';
import { HorseMeasurementEntity } from '../../../src/modules/horses/entities/horse-measurement.entity';
import { HorseOwnershipEntity } from '../../../src/modules/horses/entities/horse-ownership.entity';
import { HorseEntity } from '../../../src/modules/horses/entities/horse.entity';
import { HorseGender } from '../../../src/modules/horses/enums/horse-gender.enum';
import { HorseListSortBy } from '../../../src/modules/horses/enums/horse-list-sort.enum';
import { HorseMeasurementAlertSeverity } from '../../../src/modules/horses/enums/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../../../src/modules/horses/enums/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../../src/modules/horses/enums/horse-status.enum';
import { HorseMeasurementsService } from '../../../src/modules/horses/horse-measurements/horse-measurements.service';
import { HorseOwnershipsService } from '../../../src/modules/horses/horse-ownerships/horse-ownerships.service';
import { HorseProfilesRepository } from '../../../src/modules/horses/horse-profiles/horse-profiles.repository';
import { HorseProfilesService } from '../../../src/modules/horses/horse-profiles/horse-profiles.service';
import { HorseStatusesModule } from '../../../src/modules/horses/horse-statuses/horse-statuses.module';
import { HorseStatusesService } from '../../../src/modules/horses/horse-statuses/horse-statuses.service';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../../src/modules/horses/shared/horse-ownership.service';
import { HorsePedigreeRepository } from '../../../src/modules/horses/shared/horse-pedigree.repository';
import { HorsePedigreeService } from '../../../src/modules/horses/shared/horse-pedigree.service';
import { MedicalAccessService } from '../../../src/modules/medical/shared/medical-access.service';
import { BarnsService } from '../../../src/modules/stable/barns/barns.service';
import { BarnEntity } from '../../../src/modules/stable/entities/barn.entity';
import { StallAssignmentEntity } from '../../../src/modules/stable/entities/stall-assignment.entity';
import { StallEntity } from '../../../src/modules/stable/entities/stall.entity';
import { StableAccessService } from '../../../src/modules/stable/shared/stable-access.service';
import { StallsService } from '../../../src/modules/stable/stalls/stalls.service';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../../src/modules/training/shared/training-operations.facade';
import { ParticipantEligibilityListener } from '../../../src/modules/training/training-sessions/participant-eligibility.listener';
import { UserEntity } from '../../../src/modules/users/entities/user.entity';
import { UsersService } from '../../../src/modules/users/services/users.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

describe('Findings R3: Flow 1, users, auth (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let statuses: HorseStatusesService;
  let ownerships: HorseOwnershipsService;
  let profiles: HorseProfilesService;
  let measurements: HorseMeasurementsService;
  let stalls: StallsService;
  let barns: BarnsService;
  let users: UsersService;
  let auditLogs: AuditLogsService;
  let listener: ParticipantEligibilityListener;
  let access: HorseAccessService;
  let cmId: string;
  let cm: Actor;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const ownedHorse = async (name: string) => {
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse(name, { ownerId: owner });
    await seed.ownership(horse, owner, '2026-01-01T00:00:00Z');
    return { owner, horse };
  };

  const barnWithTrainer = async () => {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const barn = await seed.barn(`Khu ${randomUUID().slice(0, 4)}`);
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    return { trainerId, barn };
  };

  const stall = async (barnId: string, code: string): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      'INSERT INTO stalls (id, version, barn_id, code) VALUES ($1, 1, $2, $3)',
      [id, barnId, code],
    );
    return id;
  };

  const outboxCount = async (): Promise<number> => {
    const [row] = await dataSource.query<{ n: string }[]>(
      'SELECT count(*) AS n FROM outbox_events',
    );
    return Number(row.n);
  };

  const enrolledInFutureSession = async (
    trainerId: string,
    horse: string,
    groomId: string | null = null,
  ) => {
    const { classId } = await seed.trainingClass(trainerId, {
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
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', now() + interval '1 day', now() + interval '25 hours', 'SCHEDULED', 'LIGHT', 3000)`,
      [sessionId, classId],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES ($1, 1, $2, $3, $4, 'PLANNED', $5)`,
      [participantId, sessionId, horse, enrollmentId, groomId],
    );
    return { classId, sessionId, participantId };
  };

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
        HorseStatusesModule,
      ],
    }).compile();
    statuses = moduleRef.get(HorseStatusesService);
    access = new HorseAccessService(dataSource);
    const audit = new AuditService();
    const events = new DomainEventPublisher();
    const stableAccess = new StableAccessService(access);
    ownerships = new HorseOwnershipsService(
      dataSource.getRepository(HorseOwnershipEntity),
      access,
      new HorseOwnershipService(),
      new MedicalAccessService(access, dataSource),
      dataSource,
      audit,
      events,
    );
    profiles = new HorseProfilesService(
      new HorseProfilesRepository(
        dataSource.getRepository(HorseEntity),
        dataSource,
      ),
      dataSource.getRepository(HorseEntity),
      access,
      new HorsePedigreeService(new HorsePedigreeRepository(), access),
      { signDownloadUrls: () => Promise.resolve(new Map()) } as never,
      {} as never,
      events,
      dataSource,
      audit,
      new HorseOwnershipService(),
    );
    measurements = new HorseMeasurementsService(
      dataSource.getRepository(HorseMeasurementEntity),
      access,
      dataSource,
      events,
      audit,
    );
    stalls = new StallsService(
      dataSource.getRepository(StallEntity),
      dataSource.getRepository(StallAssignmentEntity),
      dataSource,
      audit,
      stableAccess,
    );
    barns = new BarnsService(
      dataSource.getRepository(BarnEntity),
      dataSource,
      stableAccess,
      audit,
      new TrainingAccessService(dataSource, access),
    );
    const keycloak = {
      setUserEnabled: jest.fn(),
      logoutUser: jest.fn(),
    };
    users = new UsersService(
      dataSource.getRepository(UserEntity),
      keycloak as unknown as KeycloakUserService,
      dataSource,
      audit,
    );
    auditLogs = new AuditLogsService(
      dataSource.getRepository(AuditLogEntity),
      dataSource,
    );
    listener = new ParticipantEligibilityListener(
      dataSource,
      new TrainingOperationsFacade(),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    cmId = await seed.user(UserRole.CLUB_MANAGER);
    cm = await actorOf(cmId, UserRole.CLUB_MANAGER);
  });

  it('B13 refuses to deactivate a groom still assigned to lead a future training run', async () => {
    const { trainerId } = await barnWithTrainer();
    const groomId = await seed.user(UserRole.GROOM);
    const horse = await seed.horse('Gió');
    await enrolledInFutureSession(trainerId, horse, groomId);

    const outcome = await users
      .setStatus(cm, groomId, UserStatus.INACTIVE)
      .then(() => 'deactivated')
      .catch((error: Error) => error.constructor.name);

    expect(outcome).toBe('ConflictException');
  });

  it('B20 records internal ownership transfers with a dedicated audit feature', async () => {
    const { horse } = await ownedHorse('Winx');
    const b = await seed.user(UserRole.HORSE_OWNER);
    await ownerships.transfer(cm, horse, {
      newOwnerId: b,
      reason: 'HĐ 01',
      version: 1,
    });

    const [row] = await dataSource.query<{ feature: string }[]>(
      `SELECT feature FROM audit_logs WHERE entity_id = $1 AND after_data ? 'ownerId'`,
      [horse],
    );
    expect(row.feature).not.toBe(AuditFeature.HORSE_UPDATE);
  });

  it('B21 rejects changing gender from GELDING back to MALE', async () => {
    const horse = await seed.horse('Thiến');
    await dataSource.query('UPDATE horses SET gender = $1 WHERE id = $2', [
      HorseGender.GELDING,
      horse,
    ]);

    const outcome = await profiles
      .update(cm, horse, { gender: HorseGender.MALE, version: 1 })
      .then(() => 'changed')
      .catch((error: Error) => error.constructor.name);

    expect(outcome).not.toBe('changed');
  });

  it('N13 lets the club manager lock the login of an owner who still owns an ACTIVE horse', async () => {
    const { owner } = await ownedHorse('Mây');

    const outcome = await users
      .setStatus(cm, owner, UserStatus.LOCKED)
      .then(() => 'locked')
      .catch((error: Error) => error.message);

    expect(outcome).toBe('locked');
  });

  describe('N14 external transfer and reactivation', () => {
    const transferOut = (horse: string) =>
      statuses.updateLifecycle(cm, horse, {
        lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
        reason: 'Bán ra ngoài',
      });

    it('N14a closes the ownership period when the horse is sold out of the club', async () => {
      const { horse } = await ownedHorse('Bão');
      await transferOut(horse);

      const open = await dataSource.query<{ id: string }[]>(
        'SELECT id FROM horse_ownerships WHERE horse_id = $1 AND ended_at IS NULL',
        [horse],
      );
      expect(open).toEqual([]);
    });

    it('N14b does not make the old owner the owner again on reactivation', async () => {
      const { owner, horse } = await ownedHorse('Sấm');
      await transferOut(horse);
      await statuses.updateLifecycle(cm, horse, {
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        reason: 'Mua lại',
        ownerId: await seed.user(UserRole.HORSE_OWNER),
      });

      const [row] = await dataSource.query<{ owner_id: string | null }[]>(
        'SELECT owner_id FROM horses WHERE id = $1',
        [horse],
      );
      expect(row.owner_id).not.toBe(owner);
    });
  });

  it('N19 writes an audit row when a run is cancelled by a training lock re-evaluation', async () => {
    const { trainerId } = await barnWithTrainer();
    const vet = await seed.user(UserRole.VETERINARIAN);
    const horse = await seed.horse('Mưa');
    const { participantId } = await enrolledInFutureSession(trainerId, horse);
    const lockId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status)
       VALUES ($1, 1, $2, $3, 'Nghỉ', now(), 'ACTIVE')`,
      [lockId, horse, vet],
    );

    await listener.handle({
      eventId: randomUUID(),
      horseId: horse,
      lockId,
      reason: 'Nghỉ',
      expectedEnd: null,
    });

    const [participant] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM session_participants WHERE id = $1',
      [participantId],
    );
    expect(participant.status).toBe('CANCELLED_BY_LOCK');
    const logs = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM audit_logs',
    );
    expect(logs.length).toBeGreaterThan(0);
  });

  it('F1-2 puts dead horses after living ones in the health priority sort', async () => {
    await seed.horse('An', {
      lifecycle: HorseLifecycleStatus.DECEASED,
      health: HorseHealthStatus.INJURED,
    });
    await seed.horse('Bình', { health: HorseHealthStatus.UNDER_OBSERVATION });

    const page = await profiles.list(
      cm,
      Object.assign(new HorseListQueryDto(), {
        sortBy: HorseListSortBy.HEALTH_PRIORITY,
      }),
    );

    expect(page.items.map((row) => row.name)).toEqual(['Bình', 'An']);
  });

  it('F1-4 opens an exam request when a bought-back horse is reactivated', async () => {
    const { horse } = await ownedHorse('Về nhà');
    await statuses.updateLifecycle(cm, horse, {
      lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
      reason: 'Bán',
    });
    await statuses.updateLifecycle(cm, horse, {
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      reason: 'Mua lại',
    });

    const requests = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM medical_exam_requests WHERE horse_id = $1 AND status = 'PENDING'`,
      [horse],
    );
    expect(requests.length).toBe(1);
  });

  it('F1-7 lets the club manager fix the microchip on a read-only (dead) profile', async () => {
    const horse = await seed.horse('Sai chip', {
      lifecycle: HorseLifecycleStatus.DECEASED,
    });

    const outcome = await profiles
      .update(cm, horse, { microchipId: 'CHIP-OK-1', version: 1 })
      .then(() => 'fixed')
      .catch((error: Error) => error.message);

    expect(outcome).toBe('fixed');
  });

  describe('F1-8 backdated and deleted measurements', () => {
    const feverSixDaysAgo = async () => {
      const vetId = await seed.user(UserRole.VETERINARIAN);
      const vet = await actorOf(vetId, UserRole.VETERINARIAN);
      const horse = await seed.horse('Sốt cũ');
      const [created] = await measurements.addMeasurements(vet, horse, {
        values: [{ type: HorseMeasurementType.TEMPERATURE, value: 39.5 }],
        measuredAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
        confirmAbnormal: true,
      });
      return { vet, horse, created };
    };

    it('F1-8a does not raise an URGENT alert for a fever measured 6 days ago', async () => {
      const { created } = await feverSixDaysAgo();

      expect(created.alerts.map((alert) => alert.severity)).not.toContain(
        HorseMeasurementAlertSeverity.URGENT,
      );
    });

    it('F1-8b dismisses the PENDING exam request generated from a measurement that is deleted', async () => {
      const { vet, horse, created } = await feverSixDaysAgo();
      const requestId = randomUUID();
      await dataSource.query(
        `INSERT INTO medical_exam_requests (id, version, horse_id, source, urgent, description, status, alert_type, source_ref_id)
         VALUES ($1, 1, $2, 'MEASUREMENT_ALERT', true, 'Sốt', 'PENDING', 'FEVER', $3)`,
        [requestId, horse, created.id],
      );

      await measurements.deleteMeasurement(vet, horse, created.id, {
        reason: 'Gõ sai',
      });

      const [request] = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM medical_exam_requests WHERE id = $1',
        [requestId],
      );
      expect(request.status).not.toBe('PENDING');
    });
  });

  describe('F1-9 notifications on location changes', () => {
    it('F1-9a writes an event to notify the groom when the horse moves to another stall', async () => {
      const { trainerId, barn } = await barnWithTrainer();
      const trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
      const groomId = await seed.user(UserRole.GROOM);
      const horse = await seed.horse('Đổi ô', { barnId: barn });
      const from = await stall(barn, 'A-01');
      const to = await stall(barn, 'A-02');
      await dataSource.query(
        `INSERT INTO stall_assignments (version, horse_id, stall_id, start_at) VALUES (1, $1, $2, now() - interval '1 day')`,
        [horse, from],
      );
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at) VALUES (1, $1, $2, now() - interval '1 day')`,
        [horse, groomId],
      );

      await stalls.moveHorseToStall(trainer, horse, { stallId: to });

      expect(await outboxCount()).toBeGreaterThan(0);
    });

    it('F1-9b writes an event to notify the class head trainer when retirement withdraws the horse', async () => {
      const { trainerId } = await barnWithTrainer();
      const horse = await seed.horse('Giải nghệ');
      await enrolledInFutureSession(trainerId, horse);

      await statuses.updateLifecycle(cm, horse, {
        lifecycleStatus: HorseLifecycleStatus.RETIRED,
        reason: 'Già',
      });

      const [row] = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM horse_enrollments WHERE horse_id = $1',
        [horse],
      );
      expect(row.status).not.toBe('ACTIVE');
      expect(await outboxCount()).toBeGreaterThan(0);
    });
  });

  it('F1-10 writes an event to notify the owner assigned when the profile is created', async () => {
    const owner = await seed.user(UserRole.HORSE_OWNER);

    await profiles.create(cm, {
      name: 'Mới',
      gender: HorseGender.MALE,
      ownerId: owner,
      microchipId: '900000000000101',
    });

    expect(await outboxCount()).toBeGreaterThan(0);
  });

  it('F1-11 lets the club manager change the barn head trainer while the old one still runs classes there', async () => {
    const { trainerId: oldId, barn } = await barnWithTrainer();
    const newId = await seed.user(UserRole.HEAD_TRAINER);
    const horse = await seed.horse('Lớp cũ', { barnId: barn });
    await enrolledInFutureSession(oldId, horse);

    const outcome = await barns
      .update(cm, barn, { headTrainerId: newId })
      .then(() => 'changed')
      .catch((error: Error) => error.message);

    expect(outcome).toBe('changed');
  });

  it('F1-15 hides the transfer reason from a veterinarian reading the ownership history', async () => {
    const { horse } = await ownedHorse('Bí mật');
    const b = await seed.user(UserRole.HORSE_OWNER);
    await ownerships.transfer(cm, horse, {
      newOwnerId: b,
      reason: 'HĐ số 123 ký 01/10',
      version: 1,
    });
    const vetId = await seed.user(UserRole.VETERINARIAN);

    const history = await ownerships.history(
      await actorOf(vetId, UserRole.VETERINARIAN),
      horse,
    );

    expect(history.map((period) => period.reason)).toEqual([null, null]);
  });

  it('F1-16 lets the old owner still open the horse after an internal transfer', async () => {
    const { owner: a, horse } = await ownedHorse('Đã bán');
    const b = await seed.user(UserRole.HORSE_OWNER);
    await ownerships.transfer(cm, horse, {
      newOwnerId: b,
      reason: 'HĐ',
      version: 1,
    });

    const outcome = await access
      .findReadableHorse(
        dataSource.manager,
        await actorOf(a, UserRole.HORSE_OWNER),
        a,
        horse,
      )
      .then(() => 'readable')
      .catch((error: Error) => error.constructor.name);

    expect(outcome).toBe('readable');
  });

  it('O-4 filters the audit log by feature', async () => {
    const horse = await seed.horse('Lọc');
    await seed.horseAudit(horse, {}, { a: 1 }, '2026-10-01T03:00:00Z', {
      feature: AuditFeature.HORSE_MEASURE,
    });
    await seed.horseAudit(horse, {}, { b: 1 }, '2026-10-01T03:00:00Z', {
      feature: AuditFeature.HORSE_UPDATE,
    });

    const page = await auditLogs.list(
      cm,
      Object.assign(new AuditLogListQueryDto(), {
        page: 1,
        limit: 20,
        feature: AuditFeature.HORSE_MEASURE,
      }),
    );

    expect(page.items.map((row) => row.feature)).toEqual([
      AuditFeature.HORSE_MEASURE,
    ]);
  });
});

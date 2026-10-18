import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import { OutboxRelayService } from '../../../src/common/infrastructure/events/outbox-relay.service';
import type { Actor } from '../../../src/common/types/actor';
import { clubToday, shiftDays } from '../../../src/common/utils/club-date';
import { HorseEntity } from '../../../src/modules/horses/entities/horse.entity';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../../src/modules/horses/enums/horse-status.enum';
import { HorseProfilesRepository } from '../../../src/modules/horses/horse-profiles/horse-profiles.repository';
import { HorseProfilesService } from '../../../src/modules/horses/horse-profiles/horse-profiles.service';
import { HorseStatusesService } from '../../../src/modules/horses/horse-statuses/horse-statuses.service';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import { CareSchedulesService } from '../../../src/modules/medical/care-schedules/care-schedules.service';
import {
  CareAssigneeType,
  CareScheduleStatus,
  CareScheduleType,
} from '../../../src/modules/medical/constants/care-schedule.enum';
import { MedicalCheckupsService } from '../../../src/modules/medical/shared/medical-checkups.service';
import { MEDICAL_CARE_SCHEDULE_DUE_EVENT } from '../../../src/modules/medical/constants/medical-events.constants';
import { CaseLockDecision } from '../../../src/modules/medical/constants/medical-case.enum';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../../../src/modules/medical/constants/injury-marker.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../../src/modules/medical/constants/medical-visit.enum';
import { ExamRequestsService } from '../../../src/modules/medical/exam-requests/exam-requests.service';
import { HealthStatusesService } from '../../../src/modules/medical/health-statuses/health-statuses.service';
import { MedicalDashboardService } from '../../../src/modules/medical/medical-dashboard/medical-dashboard.service';
import { MedicalCasesService } from '../../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalVisitsService } from '../../../src/modules/medical/medical-records/medical-visits.service';
import { MedicalRemindersService } from '../../../src/modules/medical/medical-reminders/medical-reminders.service';
import { MedicalModule } from '../../../src/modules/medical/medical.module';
import { TrainingLockService } from '../../../src/modules/medical/training-locks/training-locks.service';
import { GroomAssignmentChangedListener } from '../../../src/modules/notifications/delivery/groom-assignment-changed.listener';
import { HorseDeceasedListener } from '../../../src/modules/notifications/delivery/horse-deceased.listener';
import { HorseGroomReleasedListener } from '../../../src/modules/notifications/delivery/horse-groom-released.listener';
import { HorseNotificationsService } from '../../../src/modules/notifications/delivery/horse-notifications.service';
import { MedicalEventsListener } from '../../../src/modules/notifications/delivery/medical-events.listener';
import { MedicalNotificationsService } from '../../../src/modules/notifications/delivery/medical-notifications.service';
import { NotificationDeliveryService } from '../../../src/modules/notifications/delivery/notification-delivery.service';
import { NotificationRecipientsRepository } from '../../../src/modules/notifications/delivery/notification-recipients.repository';
import type { NotificationDraft } from '../../../src/modules/notifications/types/notification.types';
import { GroomAssignmentsModule } from '../../../src/modules/stable/groom-assignments/groom-assignments.module';
import { GroomAssignmentsService } from '../../../src/modules/stable/groom-assignments/groom-assignments.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('R3 Flow 3 medical findings (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let visits: MedicalVisitsService;
  let cases: MedicalCasesService;
  let careSchedules: CareSchedulesService;
  let locks: TrainingLockService;
  let health: HealthStatusesService;
  let requests: ExamRequestsService;
  let reminders: MedicalRemindersService;
  let dashboard: MedicalDashboardService;
  let statuses: HorseStatusesService;
  let grooms: GroomAssignmentsService;
  let profiles: HorseProfilesService;
  let relay: OutboxRelayService;
  const sent: NotificationDraft[] = [];

  const actorOf = async (userId: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const person = async (role: UserRole) => {
    const id = await seed.user(role);
    return { id, actor: await actorOf(id, role) };
  };

  /** Ngựa có khu (kèm Head Trainer), chủ và một Club Manager */
  const scene = async (name = 'Gió') => {
    const vet = await person(UserRole.VETERINARIAN);
    const ht = await person(UserRole.HEAD_TRAINER);
    const cm = await person(UserRole.CLUB_MANAGER);
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [ht.id, barnId],
    );
    const horse = await seed.horse(name, { barnId, ownerId: owner });
    await seed.ownership(horse, owner, '2026-01-01T00:00:00Z');
    return { vet, ht, cm, owner, barnId, horse };
  };

  /** Giao hết outbox cho các listener thông báo (gửi thật bị thay bằng bản ghi lại) */
  const deliverAll = async () => {
    await dataSource.query('UPDATE outbox_events SET next_attempt_at = now()');
    while ((await relay.relayBatch()) > 0) {
      /* tiếp tục tới khi hết */
    }
    const failed = await dataSource.query(
      'SELECT event_name, last_error FROM outbox_events WHERE last_error IS NOT NULL',
    );
    expect(failed).toEqual([]);
  };

  const sentTo = (userId: string) =>
    sent.filter((draft) => draft.recipientIds.includes(userId));

  const isoIn = (days: number) =>
    new Date(Date.now() + days * DAY_MS).toISOString();

  const issueVisit = (actor: Actor, horse: string, extra: object = {}) =>
    visits.createStandaloneVisit(actor, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.ISSUE,
      initialDiagnosis: 'Viêm gân',
      ...extra,
    });

  const openCaseId = async (horse: string) => {
    const [row] = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM medical_cases WHERE horse_id = $1 AND status = 'OPEN'`,
      [horse],
    );
    return row.id;
  };

  const recentVisit = (horse: string, vetId: string) =>
    seed.visit(horse, vetId, new Date(Date.now() - DAY_MS).toISOString());

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
        MedicalModule,
        GroomAssignmentsModule,
      ],
      providers: [
        NotificationRecipientsRepository,
        {
          provide: NotificationDeliveryService,
          useValue: {
            send: (draft: NotificationDraft) => {
              sent.push(draft);
              return Promise.resolve(draft.recipientIds);
            },
          },
        },
        MedicalNotificationsService,
        MedicalEventsListener,
        HorseNotificationsService,
        HorseDeceasedListener,
        HorseGroomReleasedListener,
        GroomAssignmentChangedListener,
      ],
    }).compile();
    await moduleRef.init();
    const get = <T>(token: new (...args: never[]) => T): T =>
      moduleRef.get(token, { strict: false });
    visits = get(MedicalVisitsService);
    cases = get(MedicalCasesService);
    careSchedules = get(CareSchedulesService);
    locks = get(TrainingLockService);
    health = get(HealthStatusesService);
    requests = get(ExamRequestsService);
    reminders = get(MedicalRemindersService);
    dashboard = get(MedicalDashboardService);
    statuses = get(HorseStatusesService);
    grooms = get(GroomAssignmentsService);
    relay = get(OutboxRelayService);
    const access = new HorseAccessService(dataSource);
    const horseRepo = dataSource.getRepository(HorseEntity);
    profiles = new HorseProfilesService(
      new HorseProfilesRepository(horseRepo, dataSource),
      horseRepo,
      access,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource,
      {} as never,
      {} as never,
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    sent.length = 0;
  });

  it('B14: changing the groom moves the old groom SCHEDULED care schedules to the new groom', async () => {
    const { ht, horse } = await scene();
    const oldGroom = await seed.user(UserRole.GROOM);
    const newGroom = await seed.user(UserRole.GROOM);
    await grooms.assign(ht.actor, horse, { groomId: oldGroom });
    const schedule = await seed.schedule(horse, isoIn(3), {
      type: CareScheduleType.FARRIER,
      assigneeType: CareAssigneeType.GROOM,
    });

    await grooms.assign(ht.actor, horse, { groomId: newGroom });

    const [due] = await new MedicalCheckupsService(dataSource).dueCareSchedules(
      isoIn(4).slice(0, 10),
      [horse],
    );
    expect(due).toMatchObject({ scheduleId: schedule, assignedTo: newGroom });
  });

  it('N1: a horse with an open-ended prescription from a closed case is not racing eligible', async () => {
    const { vet, cm, horse } = await scene();
    await issueVisit(vet.actor, horse, {
      prescriptions: [
        {
          medicine: 'Phenylbutazone',
          dosage: '2g',
          frequency: '1 lần/ngày',
          startDate: clubToday(),
        },
      ],
    });
    await cases.closeCase(vet.actor, await openCaseId(horse), {
      finalConclusion: 'Ổn',
    });

    const eligibility = await profiles.getEligibility(cm.actor, horse);
    expect(eligibility.healthStatus).toBe(HorseHealthStatus.ELIGIBLE);
    expect(eligibility.racingEligible).toBe(false);
  });

  it('N5: the owner is notified when a training lock is set', async () => {
    const { vet, ht, owner, horse } = await scene();
    await locks.setLock(vet.actor, horse, {
      reason: 'Viêm gân',
      lockEnd: isoIn(30),
    });
    await deliverAll();

    expect(sentTo(ht.id)).not.toHaveLength(0);
    expect(sentTo(owner)).not.toHaveLength(0);
  });

  it('N5: the owner is notified on health changes to Under observation and back to Eligible', async () => {
    const { vet, ht, owner, horse } = await scene();
    await health.updateHealth(vet.actor, horse, {
      healthStatus: HorseHealthStatus.UNDER_OBSERVATION,
      reason: 'Ho nhẹ',
    });
    await health.updateHealth(vet.actor, horse, {
      healthStatus: HorseHealthStatus.ELIGIBLE,
      reason: 'Hết ho',
    });
    await deliverAll();

    expect(sentTo(ht.id)).toHaveLength(1);
    expect(sentTo(owner)).toHaveLength(2);
  });

  it('N5: the owner is notified when the horse lifecycle changes (retired)', async () => {
    const { cm, owner, horse } = await scene();
    await statuses.updateLifecycle(cm.actor, horse, {
      lifecycleStatus: HorseLifecycleStatus.RETIRED,
      reason: 'Giải nghệ',
    });
    await deliverAll();

    expect(sentTo(owner)).not.toHaveLength(0);
  });

  it('N5: the requester is notified when their exam request is dismissed', async () => {
    const { vet, ht, horse } = await scene();
    const request = await requests.create(ht.actor, horse, {
      description: 'Khập khiễng',
    });
    await requests.dismiss(vet.actor, request.id, { reason: 'Đã xem, ổn' });
    await deliverAll();

    expect(sentTo(ht.id)).not.toHaveLength(0);
  });

  it('N5: the requester is notified when their exam request is examined', async () => {
    const { vet, ht, horse } = await scene();
    const request = await requests.create(ht.actor, horse, {
      description: 'Khập khiễng',
    });
    await visits.createStandaloneVisit(vet.actor, horse, {
      kind: MedicalVisitKind.REQUEST,
      conclusion: MedicalVisitConclusion.NORMAL,
      requestIds: [request.id],
    });
    await deliverAll();

    expect(sentTo(ht.id)).not.toHaveLength(0);
  });

  it('N5: an active lock past its lockEnd is reminded to the Head Trainer by the daily job', async () => {
    const { vet, ht, horse } = await scene();
    await recentVisit(horse, vet.id);
    await dataSource.query(
      `INSERT INTO training_locks (version, horse_id, locked_by, reason, lock_start, lock_end, status)
       VALUES (1, $1, $2, 'Viêm gân', now() - interval '10 days', now() - interval '2 days', 'ACTIVE')`,
      [horse, vet.id],
    );

    await reminders.runDaily();
    await deliverAll();

    expect(sentTo(ht.id)).not.toHaveLength(0);
  });

  it('N6: a care schedule due in 2 days is reminded in advance', async () => {
    const { horse } = await scene();
    const schedule = await seed.schedule(horse, isoIn(2), {
      type: CareScheduleType.VACCINATION,
    });

    await reminders.notifyDueCareSchedules(clubToday());

    const rows = await dataSource.query<unknown[]>(
      `SELECT 1 FROM outbox_events WHERE payload->>'scheduleId' = $1`,
      [schedule],
    );
    expect(rows).not.toHaveLength(0);
  });

  it('N6: an overdue care schedule is reminded again a week later', async () => {
    const { horse } = await scene();
    await seed.schedule(horse, isoIn(-10), {
      type: CareScheduleType.DEWORMING,
    });

    await reminders.notifyDueCareSchedules(clubToday());
    await reminders.notifyDueCareSchedules(shiftDays(clubToday(), 7));

    const rows = await dataSource.query<{ n: number }[]>(
      `SELECT COUNT(DISTINCT payload->>'eventId')::int AS n
         FROM outbox_events WHERE event_name = $1`,
      [MEDICAL_CARE_SCHEDULE_DUE_EVENT],
    );
    expect(rows[0].n).toBe(2);
  });

  it('N16: the dashboard lists an INJURED horse that has no medical case', async () => {
    const { vet, cm, horse } = await scene();
    await health.updateHealth(vet.actor, horse, {
      healthStatus: HorseHealthStatus.INJURED,
      reason: 'Trầy chân',
    });

    const result = await dashboard.get(cm.actor, {});
    const {
      herd,
      checkups,
      careSchedules,
      openCases,
      pendingRequests,
      ...rest
    } = result;
    void [herd, checkups, careSchedules, openCases, pendingRequests];
    expect(JSON.stringify(rest)).toContain(horse);
  });

  it('N16: the quarantine notification lists other horses in the same barn', async () => {
    const { vet, barnId, horse } = await scene('Gió');
    await seed.horse('Mây', { barnId });
    await health.updateHealth(vet.actor, horse, {
      healthStatus: HorseHealthStatus.QUARANTINED,
      reason: 'Nghi cúm',
    });
    await deliverAll();

    const messages = sent.map((draft) => draft.message).join('\n');
    expect(messages).toContain('Mây');
  });

  it('N21: the author vet is notified when another vet voids their visit', async () => {
    const { horse } = await scene();
    const author = await person(UserRole.VETERINARIAN);
    const other = await person(UserRole.VETERINARIAN);
    const visit = await visits.createStandaloneVisit(author.actor, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
    });
    await visits.voidVisit(other.actor, visit.id, { reason: 'Nhầm ngựa' });
    await deliverAll();

    expect(sentTo(author.id)).not.toHaveLength(0);
  });

  it('D4: two distinct sprains on the same leg can be recorded in one visit', async () => {
    const { vet, horse } = await scene();

    await expect(
      issueVisit(vet.actor, horse, {
        injuries: [
          {
            bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
            injuryType: InjuryType.SPRAIN,
            recoveryStatus: RecoveryStatus.ACUTE,
            position: { x: 0.1, y: 0.6, z: 0 },
            notes: 'Cẳng',
          },
          {
            bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
            injuryType: InjuryType.SPRAIN,
            recoveryStatus: RecoveryStatus.ACUTE,
            position: { x: 0.1, y: 0.2, z: 0 },
            notes: 'Cổ chân',
          },
        ],
      }),
    ).resolves.toBeDefined();
  });

  it('F3-3: an exam date earlier than the horse profile creation is rejected with 400', async () => {
    const vet = await person(UserRole.VETERINARIAN);
    const horse = await seed.horse('Mới', { createdAt: isoIn(-1) });

    await expect(
      visits.createStandaloneVisit(vet.actor, horse, {
        kind: MedicalVisitKind.ROUTINE,
        conclusion: MedicalVisitConclusion.NORMAL,
        examDate: isoIn(-3),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('F3-6: an exam date 30 seconds in the future (client clock skew) is accepted', async () => {
    const { vet, horse } = await scene();

    await expect(
      visits.createStandaloneVisit(vet.actor, horse, {
        kind: MedicalVisitKind.ROUTINE,
        conclusion: MedicalVisitConclusion.NORMAL,
        examDate: new Date(Date.now() + 30_000).toISOString(),
      }),
    ).resolves.toBeDefined();
  });

  it('F3-7: closing a second case asks what to do with the lock kept from the first case', async () => {
    const { vet, horse } = await scene();
    await issueVisit(vet.actor, horse);
    const first = await openCaseId(horse);
    await locks.setLock(vet.actor, horse, { reason: 'Viêm gân' });
    await cases.closeCase(vet.actor, first, {
      finalConclusion: 'Đỡ',
      lockDecision: CaseLockDecision.KEEP,
      lockExpectedEnd: isoIn(10),
    });
    await issueVisit(vet.actor, horse, { initialDiagnosis: 'Tái phát' });
    const second = await openCaseId(horse);

    await expect(
      cases.closeCase(vet.actor, second, {
        finalConclusion: 'Khỏi',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('F3-9: a routine checkup appointment in the past is reminded to vets by the daily job', async () => {
    const { vet, horse } = await scene();
    await recentVisit(horse, vet.id);
    await seed.schedule(horse, isoIn(-2), {
      type: CareScheduleType.ROUTINE_CHECKUP,
    });

    await reminders.runDaily();
    await deliverAll();

    expect(sentTo(vet.id)).not.toHaveLength(0);
  });

  it('F3-9: a routine checkup appointment can be cancelled', async () => {
    const { vet, horse } = await scene();
    const appointment = await seed.schedule(horse, isoIn(5), {
      type: CareScheduleType.ROUTINE_CHECKUP,
    });

    await expect(
      careSchedules.cancel(vet.actor, appointment, { reason: 'Đặt nhầm' }),
    ).resolves.toMatchObject({ status: CareScheduleStatus.CANCELLED });
  });

  it('F3-10: completing a care schedule records the actual performed date', async () => {
    const { vet, horse } = await scene();
    const schedule = await seed.schedule(horse, isoIn(-1), {
      type: CareScheduleType.VACCINATION,
      assignedTo: vet.id,
    });
    const performed = `${shiftDays(clubToday(), -1)}T03:00:00.000Z`;

    await careSchedules.complete(vet.actor, schedule, {
      completedAt: performed,
    } as never);

    const [row] = await dataSource.query<{ completed_at: Date }[]>(
      'SELECT completed_at FROM care_schedules WHERE id = $1',
      [schedule],
    );
    expect(row.completed_at.toISOString()).toBe(performed);
  });

  it('F3-11: cost report by barn keeps a visit of a horse that later moved to another barn', async () => {
    const { vet, cm, barnId, horse } = await scene();
    await issueVisit(vet.actor, horse, { cost: 30_000_000 });
    await cases.closeCase(vet.actor, await openCaseId(horse), {
      finalConclusion: 'Khỏi',
    });
    const otherBarn = await seed.barn('Khu B');
    await dataSource.query('UPDATE horses SET barn_id = $1 WHERE id = $2', [
      otherBarn,
      horse,
    ]);

    const report = await cases.costReport(cm.actor, {
      from: clubToday(),
      to: clubToday(),
      barnId,
    });
    expect(report.totalCost).toBe(30_000_000);
  });

  it('F3-13: keeping the lock when closing a case notifies the Head Trainer of the new expected end', async () => {
    const { vet, ht, cm, horse } = await scene();
    await issueVisit(vet.actor, horse);
    await locks.setLock(vet.actor, horse, {
      reason: 'Viêm gân',
      lockEnd: isoIn(5),
    });
    await deliverAll();
    sent.length = 0;

    await cases.closeCase(vet.actor, await openCaseId(horse), {
      finalConclusion: 'Đỡ',
      lockDecision: CaseLockDecision.KEEP,
      lockExpectedEnd: isoIn(20),
    });
    await deliverAll();

    expect(sentTo(cm.id)).not.toHaveLength(0);
    expect(sentTo(ht.id)).not.toHaveLength(0);
  });

  it('F3-14: pending NORMAL exam requests are summarised to vets by the daily job', async () => {
    const { vet, ht, horse } = await scene();
    await recentVisit(horse, vet.id);
    await requests.create(ht.actor, horse, { description: 'Khập khiễng nhẹ' });

    await reminders.runDaily();
    await deliverAll();

    expect(sentTo(vet.id)).not.toHaveLength(0);
  });

  it('F3-15: the vet who recorded a visit is notified when another vet adjusts its cost', async () => {
    const { vet, cm, horse } = await scene();
    const other = await person(UserRole.VETERINARIAN);
    const visit = await issueVisit(vet.actor, horse, { cost: 1_000_000 });
    await deliverAll();
    sent.length = 0;

    await visits.adjustVisitCost(other.actor, visit.id, {
      cost: 2_000_000,
      reason: 'Thiếu hóa đơn',
    });
    await deliverAll();

    expect(sentTo(cm.id)).not.toHaveLength(0);
    expect(sentTo(vet.id)).not.toHaveLength(0);
  });

  it('F3-17: a prescription start date years before the exam date is rejected with 400', async () => {
    const { vet, horse } = await scene();

    await expect(
      visits.createStandaloneVisit(vet.actor, horse, {
        kind: MedicalVisitKind.ROUTINE,
        conclusion: MedicalVisitConclusion.NORMAL,
        prescriptions: [
          {
            medicine: 'Ivermectin',
            dosage: '10ml',
            frequency: '1 lần',
            startDate: '2019-01-01',
            endDate: '2019-01-10',
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

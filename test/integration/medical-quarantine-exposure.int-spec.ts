import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import { OutboxRelayService } from '../../src/common/infrastructure/events/outbox-relay.service';
import type { Actor } from '../../src/common/types/actor';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../src/modules/horses/enums/horse-status.enum';
import { MEDICAL_HEALTH_CHANGED_EVENT } from '../../src/modules/medical/constants/medical-events.constants';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import { HealthStatusesService } from '../../src/modules/medical/health-statuses/health-statuses.service';
import { MedicalDashboardService } from '../../src/modules/medical/medical-dashboard/medical-dashboard.service';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import { MedicalModule } from '../../src/modules/medical/medical.module';
import type { HealthChangedEvent } from '../../src/modules/medical/types/medical-events.types';
import { MedicalEventsListener } from '../../src/modules/notifications/delivery/medical-events.listener';
import { MedicalNotificationsService } from '../../src/modules/notifications/delivery/medical-notifications.service';
import { NotificationDeliveryService } from '../../src/modules/notifications/delivery/notification-delivery.service';
import { NotificationRecipientsRepository } from '../../src/modules/notifications/delivery/notification-recipients.repository';
import type { NotificationDraft } from '../../src/modules/notifications/types/notification.types';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Injured/quarantined horses without a case and quarantine exposure (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let health: HealthStatusesService;
  let visits: MedicalVisitsService;
  let dashboard: MedicalDashboardService;
  let relay: OutboxRelayService;
  const sent: NotificationDraft[] = [];

  const person = async (role: UserRole) => {
    const id = await seed.user(role);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    const actor: Actor = { sub: row.keycloak_id, roles: [role] };
    return { id, actor };
  };

  const assignGroom = (horseId: string, groomId: string) =>
    dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [horseId, groomId],
    );

  const healthEvent = async (horseId: string) => {
    const [row] = await dataSource.query<{ payload: HealthChangedEvent }[]>(
      `SELECT payload FROM outbox_events
        WHERE event_name = $1 AND payload->>'horseId' = $2`,
      [MEDICAL_HEALTH_CHANGED_EVENT, horseId],
    );
    return row.payload;
  };

  const deliverAll = async () => {
    await dataSource.query('UPDATE outbox_events SET next_attempt_at = now()');
    while ((await relay.relayBatch()) > 0) {
      /* tiếp tục tới khi hết */
    }
    const failed = await dataSource.query<unknown[]>(
      'SELECT event_name, last_error FROM outbox_events WHERE last_error IS NOT NULL',
    );
    expect(failed).toEqual([]);
  };

  const messageTo = (userId: string) =>
    sent
      .filter((draft) => draft.recipientIds.includes(userId))
      .map((draft) => draft.message);

  /** Khu A có Head Trainer; ngựa Gió của một chủ, do một Groom phụ trách */
  const scene = async () => {
    const vet = await person(UserRole.VETERINARIAN);
    const ht = await person(UserRole.HEAD_TRAINER);
    const cm = await person(UserRole.CLUB_MANAGER);
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const groom = await seed.user(UserRole.GROOM);
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [ht.id, barnId],
    );
    const horse = await seed.horse('Gió', { barnId, ownerId: owner });
    await assignGroom(horse, groom);
    return { vet, ht, cm, owner, groom, barnId, horse };
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
        MedicalModule,
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
      ],
    }).compile();
    await moduleRef.init();
    const get = <T>(token: new (...args: never[]) => T): T =>
      moduleRef.get(token, { strict: false });
    health = get(HealthStatusesService);
    visits = get(MedicalVisitsService);
    dashboard = get(MedicalDashboardService);
    relay = get(OutboxRelayService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    sent.length = 0;
  });

  describe('dashboard horsesWithoutCase', () => {
    it('lists injured and quarantined horses without an open case, quarantined first then oldest first', async () => {
      const { vet, cm, barnId } = await scene();
      const injuredOld = await seed.horse('Bão', {
        barnId,
        health: HorseHealthStatus.INJURED,
      });
      const injuredNew = await seed.horse('An', {
        barnId,
        health: HorseHealthStatus.INJURED,
      });
      const quarantined = await seed.horse('Cát', {
        barnId,
        health: HorseHealthStatus.QUARANTINED,
      });
      const withCase = await seed.horse('Dừa', {
        barnId,
        health: HorseHealthStatus.INJURED,
      });
      await seed.medicalCase(withCase, vet.id);
      await seed.horse('Én', { barnId, health: HorseHealthStatus.ELIGIBLE });
      await seed.horse('Phố', {
        barnId,
        health: HorseHealthStatus.INJURED,
        lifecycle: HorseLifecycleStatus.TRANSFERRED,
      });
      await seed.horse('Gạo', {
        barnId,
        health: HorseHealthStatus.INJURED,
        deleted: true,
      });
      for (const [id, to, at] of [
        [injuredOld, HorseHealthStatus.INJURED, '2026-09-01T02:00:00Z'],
        [injuredNew, HorseHealthStatus.INJURED, '2026-09-10T02:00:00Z'],
        [quarantined, HorseHealthStatus.QUARANTINED, '2026-09-15T02:00:00Z'],
      ] as const) {
        await seed.horseAudit(
          id,
          { healthStatus: HorseHealthStatus.INJURED },
          { healthStatus: HorseHealthStatus.ELIGIBLE },
          '2026-08-01T02:00:00Z',
        );
        await seed.horseAudit(
          id,
          { healthStatus: HorseHealthStatus.ELIGIBLE },
          { healthStatus: to },
          at,
        );
      }

      const { horsesWithoutCase } = await dashboard.get(cm.actor, {});

      expect(
        horsesWithoutCase.map((row) => [
          row.horseName,
          row.healthStatus,
          row.since?.toISOString() ?? null,
        ]),
      ).toEqual([
        ['Cát', HorseHealthStatus.QUARANTINED, '2026-09-15T02:00:00.000Z'],
        ['Bão', HorseHealthStatus.INJURED, '2026-09-01T02:00:00.000Z'],
        ['An', HorseHealthStatus.INJURED, '2026-09-10T02:00:00.000Z'],
      ]);
      expect(horsesWithoutCase[0]).toMatchObject({
        horseId: quarantined,
        barnId,
        barnName: 'Khu A',
      });
    });

    it('applies the barn and health status filters', async () => {
      const { cm, barnId } = await scene();
      const otherBarn = await seed.barn('Khu B');
      await seed.horse('Bão', { barnId, health: HorseHealthStatus.INJURED });
      await seed.horse('Cát', {
        barnId,
        health: HorseHealthStatus.QUARANTINED,
      });
      await seed.horse('Mây', {
        barnId: otherBarn,
        health: HorseHealthStatus.INJURED,
      });

      const byBarn = await dashboard.get(cm.actor, { barnId });
      const byStatus = await dashboard.get(cm.actor, {
        healthStatus: HorseHealthStatus.INJURED,
      });

      expect(byBarn.horsesWithoutCase.map((row) => row.horseName)).toEqual([
        'Cát',
        'Bão',
      ]);
      expect(
        byStatus.horsesWithoutCase.map((row) => row.horseName).sort(),
      ).toEqual(['Bão', 'Mây']);
    });
  });

  describe('quarantine exposure', () => {
    it('captures horses in the same barn and with the same groom, skipping itself and transferred or deleted horses', async () => {
      const { vet, groom, barnId, horse } = await scene();
      const otherBarn = await seed.barn('Khu B');
      const barnMate = await seed.horse('Mây', { barnId });
      const both = await seed.horse('Sương', { barnId });
      await assignGroom(both, groom);
      const groomMate = await seed.horse('Lúa', { barnId: otherBarn });
      await assignGroom(groomMate, groom);
      const retired = await seed.horse('Hạt', {
        barnId,
        lifecycle: HorseLifecycleStatus.RETIRED,
      });
      await seed.horse('Phố', {
        barnId,
        lifecycle: HorseLifecycleStatus.TRANSFERRED,
      });
      await seed.horse('Gạo', { barnId, deleted: true });
      await seed.horse('Xa', { barnId: otherBarn });

      await health.updateHealth(vet.actor, horse, {
        healthStatus: HorseHealthStatus.QUARANTINED,
        reason: 'Nghi cúm',
      });

      expect((await healthEvent(horse)).exposedHorses).toEqual([
        {
          horseId: retired,
          horseName: 'Hạt',
          sameBarn: true,
          sameGroom: false,
        },
        {
          horseId: groomMate,
          horseName: 'Lúa',
          sameBarn: false,
          sameGroom: true,
        },
        {
          horseId: barnMate,
          horseName: 'Mây',
          sameBarn: true,
          sameGroom: false,
        },
        { horseId: both, horseName: 'Sương', sameBarn: true, sameGroom: true },
      ]);
    });

    it('captures the exposure when a visit sets the horse quarantined', async () => {
      const { vet, barnId, horse } = await scene();
      const barnMate = await seed.horse('Mây', { barnId });

      await visits.createStandaloneVisit(vet.actor, horse, {
        kind: MedicalVisitKind.ROUTINE,
        conclusion: MedicalVisitConclusion.ISSUE,
        initialDiagnosis: 'Nghi cúm',
        healthStatus: HorseHealthStatus.QUARANTINED,
        healthReason: 'Sốt cao',
      });

      expect((await healthEvent(horse)).exposedHorses).toEqual([
        {
          horseId: barnMate,
          horseName: 'Mây',
          sameBarn: true,
          sameGroom: false,
        },
      ]);
    });

    it('does not attach exposure to an injured change', async () => {
      const { vet, barnId, horse } = await scene();
      await seed.horse('Mây', { barnId });

      await health.updateHealth(vet.actor, horse, {
        healthStatus: HorseHealthStatus.INJURED,
        reason: 'Trầy chân',
      });

      expect(await healthEvent(horse)).not.toHaveProperty('exposedHorses');
    });

    it('lists exposed horses to the head trainer, club manager and groom but not to the owner or the vet', async () => {
      const { vet, ht, cm, owner, groom, barnId, horse } = await scene();
      await seed.horse('Mây', { barnId });

      await health.updateHealth(vet.actor, horse, {
        healthStatus: HorseHealthStatus.QUARANTINED,
        reason: 'Nghi cúm',
      });
      await deliverAll();

      for (const staff of [ht.id, cm.id, groom]) {
        expect(messageTo(staff)).toEqual([
          expect.stringContaining('Ngựa có thể đã tiếp xúc: Mây (cùng khu).'),
        ]);
      }
      expect(messageTo(owner)).toHaveLength(1);
      expect(messageTo(owner)[0]).not.toContain('Mây');
      expect(messageTo(vet.id)).toEqual([]);
    });
  });
});

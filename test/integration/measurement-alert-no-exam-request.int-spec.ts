import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import { OutboxRelayService } from '../../src/common/infrastructure/events/outbox-relay.service';
import type { Actor } from '../../src/common/types/actor';
import { HorseMeasurementAlert } from '../../src/modules/horses/enums/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../../src/modules/horses/enums/horse-measurement-type.enum';
import { HorseMeasurementsModule } from '../../src/modules/horses/horse-measurements/horse-measurements.module';
import { HorseMeasurementsService } from '../../src/modules/horses/horse-measurements/horse-measurements.service';
import { MedicalModule } from '../../src/modules/medical/medical.module';
import { HorseMeasurementAlertListener } from '../../src/modules/notifications/delivery/horse-measurement-alert.listener';
import { HorseNotificationsService } from '../../src/modules/notifications/delivery/horse-notifications.service';
import { NotificationDeliveryService } from '../../src/modules/notifications/delivery/notification-delivery.service';
import { NotificationRecipientsRepository } from '../../src/modules/notifications/delivery/notification-recipients.repository';
import { NotificationCategory } from '../../src/modules/notifications/enums/notification-category.enum';
import type { NotificationDraft } from '../../src/modules/notifications/types/notification.types';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Measurement alerts notify people but create no exam request (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let measurements: HorseMeasurementsService;
  let relay: OutboxRelayService;
  const sent: NotificationDraft[] = [];

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
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
        HorseMeasurementsModule,
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
        HorseNotificationsService,
        HorseMeasurementAlertListener,
      ],
    }).compile();
    await moduleRef.init();
    measurements = moduleRef.get(HorseMeasurementsService, { strict: false });
    relay = moduleRef.get(OutboxRelayService, { strict: false });
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    sent.length = 0;
  });

  it('returns the FEVER alert, notifies vet, head trainer and owner, and creates no exam request', async () => {
    const vetId = await seed.user(UserRole.VETERINARIAN);
    const htId = await seed.user(UserRole.HEAD_TRAINER);
    const ownerId = await seed.user(UserRole.HORSE_OWNER);
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [htId, barnId],
    );
    const horse = await seed.horse('Gió', { barnId, ownerId });
    const vet = await actorOf(vetId, UserRole.VETERINARIAN);

    const [created] = await measurements.addMeasurements(vet, horse, {
      values: [{ type: HorseMeasurementType.TEMPERATURE, value: 39.2 }],
      confirmAbnormal: true,
    });
    await deliverAll();

    expect(created.alerts.map((item) => item.alert)).toEqual([
      HorseMeasurementAlert.FEVER,
    ]);
    const alerts = sent.filter(
      (draft) => draft.category === NotificationCategory.MEASUREMENT_ALERT,
    );
    expect(alerts).toHaveLength(1);
    expect([...alerts[0].recipientIds].sort()).toEqual(
      [vetId, htId, ownerId].sort(),
    );
    await expect(
      dataSource.query<{ count: number }[]>(
        'SELECT COUNT(*)::int AS count FROM medical_exam_requests',
      ),
    ).resolves.toEqual([{ count: 0 }]);
  });
});

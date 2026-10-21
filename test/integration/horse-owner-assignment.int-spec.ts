import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import { OutboxRelayService } from '../../src/common/infrastructure/events/outbox-relay.service';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseEntity } from '../../src/modules/horses/entities/horse.entity';
import { HorseGender } from '../../src/modules/horses/enums/horse-gender.enum';
import { HorseProfilesRepository } from '../../src/modules/horses/horse-profiles/horse-profiles.repository';
import { HorseProfilesService } from '../../src/modules/horses/horse-profiles/horse-profiles.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../src/modules/horses/shared/horse-ownership.service';
import { HorsePedigreeRepository } from '../../src/modules/horses/shared/horse-pedigree.repository';
import { HorsePedigreeService } from '../../src/modules/horses/shared/horse-pedigree.service';
import { HorseNotificationsService } from '../../src/modules/notifications/delivery/horse-notifications.service';
import { HorseOwnerAssignedListener } from '../../src/modules/notifications/delivery/horse-owner-assigned.listener';
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

describe('Owner assignment on profile create and update notifies the new owner (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let profiles: HorseProfilesService;
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
        HorseOwnerAssignedListener,
      ],
    }).compile();
    await moduleRef.init();
    relay = moduleRef.get(OutboxRelayService, { strict: false });
    const access = new HorseAccessService(dataSource);
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
      new DomainEventPublisher(),
      dataSource,
      new AuditService(),
      new HorseOwnershipService(),
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

  it('tells the assigned owner they now own the horse and keeps the profile update audit feature', async () => {
    const cm = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const ownerId = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Mây');

    await profiles.update(cm, horse, { ownerId, version: 1 });
    await deliverAll();

    const ownership = sent.filter(
      (draft) => draft.category === NotificationCategory.OWNERSHIP,
    );
    expect(ownership).toEqual([
      expect.objectContaining({
        recipientIds: [ownerId],
        title: 'Bạn đã trở thành chủ sở hữu ngựa Mây',
        resource: expect.objectContaining({ id: horse }) as unknown,
      }),
    ]);
    await expect(
      dataSource.query<unknown[]>(
        'SELECT feature, reason FROM audit_logs WHERE entity_id = $1',
        [horse],
      ),
    ).resolves.toEqual([{ feature: 'HORSE_UPDATE', reason: null }]);
  });

  it('sends no ownership notice when the update leaves the owner unchanged', async () => {
    const cm = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const ownerId = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Gió', { ownerId });

    await profiles.update(cm, horse, { name: 'Gió Mới', version: 1 });
    await deliverAll();

    expect(sent).toEqual([]);
  });

  it('tells the owner chosen when the profile is created', async () => {
    const cm = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const ownerId = await seed.user(UserRole.HORSE_OWNER);

    const created = await profiles.create(cm, {
      name: 'Mới',
      gender: HorseGender.MALE,
      ownerId,
      microchipId: '900000000000101',
    });
    await deliverAll();

    expect(sent).toEqual([
      expect.objectContaining({
        category: NotificationCategory.OWNERSHIP,
        recipientIds: [ownerId],
        title: 'Bạn đã trở thành chủ sở hữu ngựa Mới',
        resource: expect.objectContaining({ id: created.id }) as unknown,
      }),
    ]);
  });
});

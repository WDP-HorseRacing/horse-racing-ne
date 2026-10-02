import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { NotificationRecipientsRepository } from '../../src/modules/notifications/repositories/notification-recipients.repository';
import { HorseNotificationsService } from '../../src/modules/notifications/services/horse-notifications.service';
import { NotificationsService } from '../../src/modules/notifications/services/notifications.service';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

describe('NotificationRecipientsRepository (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let recipients: NotificationRecipientsRepository;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    recipients = new NotificationRecipientsRepository(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => truncateAll(dataSource));

  const barnLedBy = async (name: string, trainerId: string | null) => {
    const barn = await seed.barn(name);
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $2 WHERE id = $1',
      [barn, trainerId],
    );
    return barn;
  };

  const softDelete = (table: 'users' | 'barns' | 'horses', id: string) =>
    dataSource.query(`UPDATE ${table} SET deleted_at = now() WHERE id = $1`, [
      id,
    ]);

  it('lists only active, not deleted users of the role', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    await seed.user(UserRole.VETERINARIAN, UserStatus.LOCKED);
    const deleted = await seed.user(UserRole.VETERINARIAN);
    await seed.user(UserRole.GROOM);
    await softDelete('users', deleted);

    await expect(
      recipients.findActiveUserIdsByRole(UserRole.VETERINARIAN),
    ).resolves.toEqual([vet]);
  });

  it('finds the horse name and the head trainer of its live barn, also for a deleted horse', async () => {
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const barn = await barnLedBy('Khu A', trainer);
    const horse = await seed.horse('Gió', { barnId: barn, deleted: true });

    await expect(recipients.findHorseBarnContact(horse)).resolves.toEqual({
      horseName: 'Gió',
      headTrainerId: trainer,
    });
    await softDelete('barns', barn);
    await expect(recipients.findHorseBarnContact(horse)).resolves.toEqual({
      horseName: 'Gió',
      headTrainerId: null,
    });
  });

  it('drops a head trainer who is locked, deleted or no longer a head trainer', async () => {
    const locked = await seed.user(UserRole.HEAD_TRAINER, UserStatus.LOCKED);
    const deleted = await seed.user(UserRole.HEAD_TRAINER);
    const groom = await seed.user(UserRole.GROOM);
    await softDelete('users', deleted);
    for (const trainerId of [locked, deleted, groom]) {
      const barn = await barnLedBy(`Khu ${trainerId}`, trainerId);
      const horse = await seed.horse(`Ngựa ${trainerId}`, { barnId: barn });
      expect(
        (await recipients.findHorseBarnContact(horse))?.headTrainerId,
      ).toBe(null);
      expect((await recipients.findBarnContact(barn))?.headTrainerId).toBe(
        null,
      );
      expect(
        (await recipients.findHorseMedicalContact(horse))?.headTrainerId,
      ).toBe(null);
    }
  });

  it('finds the head trainer and an active owner for medical notices', async () => {
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const lockedOwner = await seed.user(
      UserRole.HORSE_OWNER,
      UserStatus.LOCKED,
    );
    const barn = await barnLedBy('Khu A', trainer);
    const horse = await seed.horse('Gió', { barnId: barn, ownerId: owner });
    const other = await seed.horse('Mây', { ownerId: lockedOwner });

    await expect(recipients.findHorseMedicalContact(horse)).resolves.toEqual({
      horseName: 'Gió',
      headTrainerId: trainer,
      ownerId: owner,
    });
    await expect(recipients.findHorseMedicalContact(other)).resolves.toEqual({
      horseName: 'Mây',
      headTrainerId: null,
      ownerId: null,
    });
  });

  it('finds a live barn with its head trainer and nothing for a deleted barn', async () => {
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const barn = await barnLedBy('Khu A', trainer);

    await expect(recipients.findBarnContact(barn)).resolves.toEqual({
      barnName: 'Khu A',
      headTrainerId: trainer,
    });
    await softDelete('barns', barn);
    await expect(recipients.findBarnContact(barn)).resolves.toBeNull();
  });

  it('reads the horse name, also for a deleted horse', async () => {
    const horse = await seed.horse('Gió', { deleted: true });

    const service = new HorseNotificationsService(
      recipients,
      {} as NotificationsService,
      dataSource,
    );

    await expect(service['horseName'](horse)).resolves.toBe('Gió');
  });
});

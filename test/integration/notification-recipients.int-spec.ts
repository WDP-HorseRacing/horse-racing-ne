import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { NotificationRecipientsRepository } from '../../src/modules/notifications/delivery/notification-recipients.repository';
import { HorseNotificationsService } from '../../src/modules/notifications/delivery/horse-notifications.service';
import { NotificationDeliveryService } from '../../src/modules/notifications/delivery/notification-delivery.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('NotificationRecipientsRepository (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let recipients: NotificationRecipientsRepository;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    recipients = new NotificationRecipientsRepository(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

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
      groomId: null,
    });
    await expect(recipients.findHorseMedicalContact(other)).resolves.toEqual({
      horseName: 'Mây',
      headTrainerId: null,
      ownerId: null,
      groomId: null,
    });
  });

  it('finds the active groom of the open assignment for medical notices', async () => {
    const groom = await seed.user(UserRole.GROOM);
    const lockedGroom = await seed.user(UserRole.GROOM, UserStatus.LOCKED);
    const formerGroom = await seed.user(UserRole.GROOM);
    const gio = await seed.horse('Gió');
    const may = await seed.horse('Mây');
    const assign = (horseId: string, groomId: string, ended: boolean) =>
      dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at, end_at)
         VALUES (1, $1, $2, now() - interval '2 days', $3)`,
        [horseId, groomId, ended ? new Date() : null],
      );
    await assign(gio, formerGroom, true);
    await assign(gio, groom, false);
    await assign(may, lockedGroom, false);

    await expect(
      recipients.findHorseMedicalContact(gio),
    ).resolves.toMatchObject({ groomId: groom });
    await expect(
      recipients.findHorseMedicalContact(may),
    ).resolves.toMatchObject({ groomId: null });
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
      {} as NotificationDeliveryService,
      dataSource,
    );

    await expect(service['horseName'](horse)).resolves.toBe('Gió');
  });
});

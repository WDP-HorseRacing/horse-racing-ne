import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import { MEDICAL_CHECKUP_DUE_EVENT } from '../../src/modules/medical/constants/medical-events.constants';
import { MedicalRemindersService } from '../../src/modules/medical/medical-reminders/medical-reminders.service';
import { MedicalCheckupsService } from '../../src/modules/medical/shared/medical-checkups.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const TODAY = '2026-09-27';

describe('MedicalRemindersService.notifyDueCheckups (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let reminders: MedicalRemindersService;
  let seed: ReturnType<typeof fixtures>;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    reminders = new MedicalRemindersService(
      dataSource,
      new MedicalCheckupsService(dataSource),
      new DomainEventPublisher(),
    );
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const dueEvents = () =>
    dataSource.query<{ horseId: string; dueDate: string; eventId: string }[]>(
      `SELECT payload->>'horseId' AS "horseId",
              payload->>'dueDate' AS "dueDate",
              payload->>'eventId' AS "eventId"
         FROM outbox_events
        WHERE event_name = $1
        ORDER BY payload->>'dueDate'`,
      [MEDICAL_CHECKUP_DUE_EVENT],
    );

  it('notifies due horses without an appointment and skips the rest', async () => {
    const dueToday = await seed.horse('Winx', {
      createdAt: '2026-08-28T03:00:00Z',
    });
    const dueIn3 = await seed.horse('Black Caviar', {
      createdAt: '2026-08-31T03:00:00Z',
    });
    const booked = await seed.horse('Booked', {
      createdAt: '2026-08-29T03:00:00Z',
    });
    await seed.schedule(booked, '2026-09-28T02:00:00Z', {
      type: CareScheduleType.ROUTINE_CHECKUP,
    });
    const cancelledBooking = await seed.horse('Cancelled', {
      createdAt: '2026-08-30T03:00:00Z',
    });
    await seed.schedule(cancelledBooking, '2026-09-28T02:00:00Z', {
      type: CareScheduleType.ROUTINE_CHECKUP,
      status: CareScheduleStatus.CANCELLED,
    });
    await seed.horse('Not yet', { createdAt: '2026-09-01T03:00:00Z' });
    await seed.horse('Overdue', { createdAt: '2026-08-27T03:00:00Z' });
    await seed.horse('Long overdue', { createdAt: '2026-08-01T03:00:00Z' });

    await expect(reminders.notifyDueCheckups(TODAY)).resolves.toBe(3);

    await expect(dueEvents()).resolves.toEqual([
      expect.objectContaining({ horseId: dueToday, dueDate: '2026-09-27' }),
      expect.objectContaining({
        horseId: cancelledBooking,
        dueDate: '2026-09-29',
      }),
      expect.objectContaining({ horseId: dueIn3, dueDate: '2026-09-30' }),
    ]);
  });

  it('keeps one event id per due date across daily runs', async () => {
    const horse = await seed.horse('Winx', {
      createdAt: '2026-08-29T03:00:00Z',
    });

    await reminders.notifyDueCheckups(TODAY);
    await reminders.notifyDueCheckups('2026-09-28');

    const events = await dueEvents();
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.horseId === horse)).toBe(true);
    expect(new Set(events.map((event) => event.eventId)).size).toBe(1);
  });
});

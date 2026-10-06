import type { DataSource } from 'typeorm';
import {
  MEDICAL_CARE_SCHEDULE_DUE_EVENT,
  MEDICAL_CHECKUP_OVERDUE_EVENT,
} from '../constants/medical-events.constants';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { MedicalRemindersService } from './medical-reminders.service';

const manager = { tag: 'default-manager' };
const dataSource = { manager } as unknown as DataSource;

const anchor = (horseId: string, lastVisitDate: string) => ({
  horseId,
  horseName: horseId,
  barnId: null,
  healthStatus: 'ELIGIBLE',
  lastVisitDate,
  createdDate: '2026-01-01',
  reactivatedDate: null,
});

describe('MedicalRemindersService.notifyOverdueCheckups', () => {
  let events: { publish: jest.Mock };
  let service: MedicalRemindersService;

  beforeEach(() => {
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new MedicalRemindersService(
      dataSource,
      {
        herdCheckupAnchors: jest
          .fn()
          .mockResolvedValue([
            anchor('h-7', '2026-08-21'),
            anchor('h-8', '2026-08-20'),
            anchor('h-ok', '2026-09-20'),
          ]),
        dueCareSchedules: jest.fn().mockResolvedValue([
          {
            scheduleId: 's1',
            horseId: 'h1',
            horseName: 'Winx',
            type: 'FARRIER',
            dueDate: '2026-09-27',
            assignedTo: 'groom-1',
          },
        ]),
      } as unknown as MedicalCheckupsService,
      events,
    );
  });

  it('notifies only horses more than 7 days overdue', async () => {
    await expect(service.notifyOverdueCheckups('2026-09-27')).resolves.toBe(1);
    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      manager,
      MEDICAL_CHECKUP_OVERDUE_EVENT,
      expect.objectContaining({ horseId: 'h-8', dueDate: '2026-09-19' }),
    );
  });

  it('reuses the same event id on the next day so the notice is not sent twice', async () => {
    await service.notifyOverdueCheckups('2026-09-27');
    await service.notifyOverdueCheckups('2026-09-28');
    const ids = (
      events.publish.mock.calls as Array<
        [unknown, string, { eventId: string; horseId: string }]
      >
    )
      .filter(([, , event]) => event.horseId === 'h-8')
      .map(([, , event]) => event.eventId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('notifies each due care schedule with an id fixed by schedule and due date', async () => {
    await expect(service.notifyDueCareSchedules('2026-09-27')).resolves.toBe(1);
    await service.notifyDueCareSchedules('2026-09-28');
    const calls = events.publish.mock.calls as Array<
      [unknown, string, { eventId: string; assigneeId: string }]
    >;
    expect(calls.map(([, name]) => name)).toEqual([
      MEDICAL_CARE_SCHEDULE_DUE_EVENT,
      MEDICAL_CARE_SCHEDULE_DUE_EVENT,
    ]);
    expect(calls[0][0]).toBe(manager);
    expect(calls[0][2].eventId).toBe(calls[1][2].eventId);
    expect(calls[0][2].assigneeId).toBe('groom-1');
  });
});

describe('MedicalRemindersService.runDaily', () => {
  let shared: { herdCheckupAnchors: jest.Mock; dueCareSchedules: jest.Mock };
  let events: { publish: jest.Mock };
  let service: MedicalRemindersService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-27T01:00:00Z'));
    shared = {
      herdCheckupAnchors: jest
        .fn()
        .mockResolvedValue([anchor('h-8', '2026-08-20')]),
      dueCareSchedules: jest.fn().mockResolvedValue([]),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new MedicalRemindersService(
      dataSource,
      shared as unknown as MedicalCheckupsService,
      events,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs both reminders for today on the club calendar', async () => {
    await service.runDaily();
    expect(shared.herdCheckupAnchors).toHaveBeenCalledTimes(1);
    expect(shared.dueCareSchedules).toHaveBeenCalledWith('2026-09-27');
    expect(events.publish).toHaveBeenCalledWith(
      manager,
      MEDICAL_CHECKUP_OVERDUE_EVENT,
      expect.objectContaining({ horseId: 'h-8' }),
    );
  });

  it('logs a failure instead of throwing so the scheduler keeps running', async () => {
    shared.herdCheckupAnchors.mockRejectedValue(new Error('db down'));
    await expect(service.runDaily()).resolves.toBeUndefined();
  });

  it('still sends care schedule reminders when the overdue checkup run fails', async () => {
    shared.herdCheckupAnchors.mockRejectedValue(new Error('db down'));
    shared.dueCareSchedules.mockResolvedValue([
      {
        scheduleId: 's1',
        horseId: 'h1',
        horseName: 'Winx',
        type: 'FARRIER',
        dueDate: '2026-09-27',
        assignedTo: 'groom-1',
      },
    ]);
    await service.runDaily();
    expect(events.publish).toHaveBeenCalledWith(
      manager,
      MEDICAL_CARE_SCHEDULE_DUE_EVENT,
      expect.objectContaining({ scheduleId: 's1' }),
    );
  });

  it('still sends overdue checkup reminders when the care schedule run fails', async () => {
    shared.dueCareSchedules.mockRejectedValue(new Error('db down'));
    await expect(service.runDaily()).resolves.toBeUndefined();
    expect(events.publish).toHaveBeenCalledWith(
      manager,
      MEDICAL_CHECKUP_OVERDUE_EVENT,
      expect.objectContaining({ horseId: 'h-8' }),
    );
  });
});

import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import {
  MEDICAL_CARE_SCHEDULE_DUE_EVENT,
  MEDICAL_CHECKUP_OVERDUE_EVENT,
} from '../constants/medical-events.constants';
import { MedicalSharedRepository } from '../shared/medical-shared.repository';
import { MedicalRemindersService } from './medical-reminders.service';

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
    events = { publish: jest.fn() };
    service = new MedicalRemindersService(
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
      } as unknown as MedicalSharedRepository,
      events as unknown as DomainEventPublisher,
    );
  });

  it('notifies only horses more than 7 days overdue', async () => {
    await expect(service.notifyOverdueCheckups('2026-09-27')).resolves.toBe(1);
    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      MEDICAL_CHECKUP_OVERDUE_EVENT,
      expect.objectContaining({ horseId: 'h-8', dueDate: '2026-09-19' }),
    );
  });

  it('reuses the same event id on the next day so the notice is not sent twice', async () => {
    await service.notifyOverdueCheckups('2026-09-27');
    await service.notifyOverdueCheckups('2026-09-28');
    const ids = (
      events.publish.mock.calls as Array<
        [string, { eventId: string; horseId: string }]
      >
    )
      .filter(([, event]) => event.horseId === 'h-8')
      .map(([, event]) => event.eventId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('notifies each due care schedule with an id fixed by schedule and due date', async () => {
    await expect(service.notifyDueCareSchedules('2026-09-27')).resolves.toBe(1);
    await service.notifyDueCareSchedules('2026-09-28');
    const calls = events.publish.mock.calls as Array<
      [string, { eventId: string; assigneeId: string }]
    >;
    expect(calls.map(([name]) => name)).toEqual([
      MEDICAL_CARE_SCHEDULE_DUE_EVENT,
      MEDICAL_CARE_SCHEDULE_DUE_EVENT,
    ]);
    expect(calls[0][1].eventId).toBe(calls[1][1].eventId);
    expect(calls[0][1].assigneeId).toBe('groom-1');
  });
});

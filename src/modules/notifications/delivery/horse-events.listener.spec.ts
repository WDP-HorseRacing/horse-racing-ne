import type {
  HorseBarnAssignedEvent,
  HorseGroomReleasedEvent,
} from '../../horses/types/horse.types';
import type {
  GroomAssignmentChangedEvent,
  IncidentHandledEvent,
  StallHorseMovedEvent,
} from '../../stable/types/stable-events.types';
import { HorseNotificationsService } from './horses/horse-notifications.service';
import { GroomAssignmentChangedListener } from './stable/assignments/groom-assignment-changed.listener';
import { HorseBarnAssignedListener } from './horses/horse-barn-assigned.listener';
import { HorseGroomReleasedListener } from './horses/horse-groom-released.listener';
import { IncidentHandledListener } from './stable/incidents/incident-handled.listener';
import { StallHorseMovedListener } from './stable/assignments/stall-horse-moved.listener';

const barnAssigned: HorseBarnAssignedEvent = {
  eventId: 'e1',
  horseId: 'h1',
  barnId: 'b1',
  fromBarnId: null,
  reason: null,
  withdrawnClassIds: [],
};
const groomReleased: HorseGroomReleasedEvent = {
  eventId: 'e2',
  horseId: 'h1',
  groomId: 'g1',
};
const groomChanged: GroomAssignmentChangedEvent = {
  eventId: 'e3',
  horseId: 'h1',
  newGroomId: 'g2',
  previousGroomId: 'g1',
};

const stallMoved: StallHorseMovedEvent = {
  eventId: 'e4',
  horseId: 'h1',
  barnId: 'b1',
  stallCode: 'A-01',
  movedBy: 'ht-1',
};
const incidentHandled: IncidentHandledEvent = {
  eventId: 'e5',
  incidentId: 'i1',
  horseId: 'h1',
  reportedBy: 'g1',
  handledBy: 'ht-1',
  action: 'RESOLVED',
  resolution: 'Đã sát trùng',
};

const cases = [
  {
    name: 'HorseBarnAssignedListener',
    method: 'notifyBarnAssigned',
    make: (service: HorseNotificationsService) =>
      new HorseBarnAssignedListener(service),
    event: barnAssigned,
  },
  {
    name: 'HorseGroomReleasedListener',
    method: 'notifyGroomReleasedByTransfer',
    make: (service: HorseNotificationsService) =>
      new HorseGroomReleasedListener(service),
    event: groomReleased,
  },
  {
    name: 'GroomAssignmentChangedListener',
    method: 'notifyGroomChanged',
    make: (service: HorseNotificationsService) =>
      new GroomAssignmentChangedListener(service),
    event: groomChanged,
  },
  {
    name: 'StallHorseMovedListener',
    method: 'notifyStallMoved',
    make: (service: HorseNotificationsService) =>
      new StallHorseMovedListener(service),
    event: stallMoved,
  },
  {
    name: 'IncidentHandledListener',
    method: 'notifyIncidentHandled',
    make: (service: HorseNotificationsService) =>
      new IncidentHandledListener(service),
    event: incidentHandled,
  },
] as const;

describe.each(cases)('$name', ({ method, make, event }) => {
  it('forwards the event to the horse notification service', async () => {
    const send = jest.fn().mockResolvedValue(['u1']);
    const listener = make({
      [method]: send,
    } as unknown as HorseNotificationsService);

    await listener.handle(event as never);

    expect(send).toHaveBeenCalledWith(event);
  });

  it('rethrows errors so the outbox relay retries the event', async () => {
    const listener = make({
      [method]: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as HorseNotificationsService);

    await expect(listener.handle(event as never)).rejects.toThrow('db down');
  });
});

import type {
  HorseBarnAssignedEvent,
  HorseGroomReleasedEvent,
} from '../../horses/types/horse.types';
import type { GroomAssignmentChangedEvent } from '../../stable/types/stable-events.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';
import { GroomAssignmentChangedListener } from './groom-assignment-changed.listener';
import { HorseBarnAssignedListener } from './horse-barn-assigned.listener';
import { HorseGroomReleasedListener } from './horse-groom-released.listener';

const barnAssigned: HorseBarnAssignedEvent = {
  eventId: 'e1',
  horseId: 'h1',
  barnId: 'b1',
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

  it('logs and swallows errors instead of throwing back to the publisher', async () => {
    const listener = make({
      [method]: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as HorseNotificationsService);

    await expect(listener.handle(event as never)).resolves.toBeUndefined();
  });
});

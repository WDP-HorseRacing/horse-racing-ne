import { MedicalNotificationsService } from '../services/medical-notifications.service';
import { MedicalEventsListener } from './medical-events.listener';

describe('MedicalEventsListener', () => {
  it('forwards the event to the notification service', async () => {
    const medical = { notifyLockSet: jest.fn().mockResolvedValue([]) };
    const listener = new MedicalEventsListener(
      medical as unknown as MedicalNotificationsService,
    );
    const event = {
      eventId: 'e1',
      horseId: 'h1',
      lockId: 'l1',
      reason: 'Nghỉ',
      expectedEnd: null,
    };

    await listener.onLockSet(event);

    expect(medical.notifyLockSet).toHaveBeenCalledWith(event);
  });

  it('swallows a failure because the medical data is already committed', async () => {
    const medical = {
      notifyCaseClosed: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const listener = new MedicalEventsListener(
      medical as unknown as MedicalNotificationsService,
    );

    await expect(
      listener.onCaseClosed({
        eventId: 'e2',
        horseId: 'h1',
        caseId: 'c1',
        totalCost: 0,
      }),
    ).resolves.toBeUndefined();
  });
});

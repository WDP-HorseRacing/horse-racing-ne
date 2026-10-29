import { UserRole } from '../../../../common/enums/role.enum';
import type { PerformanceMetricCriticalEvent } from '../../../performance/types/performance.types';
import { NotificationCategory } from '../../enums/notification-category.enum';
import { NotificationPriority } from '../../enums/notification-priority.enum';
import { NotificationResourceType } from '../../enums/notification-resource-type.enum';
import { NotificationDeliveryService } from '../shared/notification-delivery.service';
import { NotificationRecipientsRepository } from '../shared/notification-recipients.repository';
import { PerformanceNotificationsService } from './performance-notifications.service';

function setup(
  options: {
    headTrainerActive?: boolean;
    horse?: boolean;
    owner?: boolean;
  } = {},
) {
  const recipients = {
    findActiveUserIdsByRole: jest.fn().mockResolvedValue(['vet-1']),
    isActiveUserWithRole: jest
      .fn()
      .mockResolvedValue(options.headTrainerActive ?? true),
    findHorseMedicalContact: jest.fn().mockResolvedValue(
      options.horse === false
        ? null
        : {
            horseName: 'Winx',
            headTrainerId: 'barn-ht',
            ownerId: options.owner === false ? null : 'owner-1',
          },
    ),
  };
  const notifications = { send: jest.fn().mockResolvedValue(['vet-1']) };
  const service = new PerformanceNotificationsService(
    recipients as unknown as NotificationRecipientsRepository,
    notifications as unknown as NotificationDeliveryService,
  );
  return { service, recipients, notifications };
}

const event: PerformanceMetricCriticalEvent = {
  eventId: 'event-1',
  horseId: 'horse-1',
  sessionId: 'session-1',
  sessionParticipantId: 'participant-1',
  headTrainerId: 'class-ht',
  heartRateBpm: 245,
  speedMps: '14.200',
  recordedAt: '2026-10-10T01:00:00.000Z',
};

describe('PerformanceNotificationsService.notifyCriticalMetric', () => {
  it('sends an urgent notice to vets and the class head trainer, pointing to the participant', async () => {
    const { service, recipients, notifications } = setup();

    await service.notifyCriticalMetric(event);

    expect(recipients.findActiveUserIdsByRole).toHaveBeenCalledWith(
      UserRole.VETERINARIAN,
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-1',
        recipientIds: ['vet-1', 'class-ht'],
        category: NotificationCategory.PERFORMANCE_ALERT,
        priority: NotificationPriority.URGENT,
        resource: {
          type: NotificationResourceType.SESSION_PARTICIPANT,
          id: 'participant-1',
          horseId: 'horse-1',
        },
      }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-1',
        recipientIds: ['owner-1'],
        priority: NotificationPriority.HIGH,
        title: 'Ngựa Winx vượt ngưỡng thể lực khi đang tập',
      }),
    );
  });

  it('sends no owner notice when the horse has no active owner', async () => {
    const { service, notifications } = setup({ owner: false });

    await service.notifyCriticalMetric(event);

    expect(notifications.send).toHaveBeenCalledTimes(1);
  });

  it('leaves out a class head trainer who is no longer active', async () => {
    const { service, notifications } = setup({
      headTrainerActive: false,
      owner: false,
    });

    await service.notifyCriticalMetric(event);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['vet-1'] }),
    );
  });

  it('only notifies vets when the class has no head trainer', async () => {
    const { service, recipients, notifications } = setup();

    await service.notifyCriticalMetric({ ...event, headTrainerId: null });

    expect(recipients.isActiveUserWithRole).not.toHaveBeenCalled();
    expect(notifications.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ recipientIds: ['vet-1'] }),
    );
  });

  it('skips the notice when the horse is gone', async () => {
    const { service, notifications } = setup({ horse: false });

    await expect(service.notifyCriticalMetric(event)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

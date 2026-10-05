import { NotificationPriority } from '../constants/notification-priority.enum';
import { NotificationResourceType } from '../constants/notification-resource-type.enum';
import { NotificationType } from '../constants/notification-type.enum';
import { toNotificationCreatedPayload } from './notification.mapper';

describe('toNotificationCreatedPayload', () => {
  it('sends only the fields the client displays', () => {
    const createdAt = new Date('2026-09-23T00:00:00Z');
    expect(
      toNotificationCreatedPayload({
        _id: 'n1',
        eventId: 'e1',
        recipientId: 'u1',
        type: NotificationType.INFO,
        priority: NotificationPriority.NORMAL,
        title: 'T',
        message: 'M',
        resource: { type: NotificationResourceType.MEDICAL_CASE, id: 'c1' },
        readAt: null,
        createdAt,
      }),
    ).toStrictEqual({
      id: 'n1',
      type: NotificationType.INFO,
      priority: NotificationPriority.NORMAL,
      title: 'T',
      message: 'M',
      resource: { type: NotificationResourceType.MEDICAL_CASE, id: 'c1' },
      createdAt,
    });
  });
});

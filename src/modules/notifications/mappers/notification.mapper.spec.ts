import { NotificationPriority } from '../constants/notification-priority.enum';
import { NotificationType } from '../constants/notification-type.enum';
import { toNotificationCreatedPayload } from './notification.mapper';

describe('toNotificationCreatedPayload', () => {
  it('sends only the fields the client displays', () => {
    const createdAt = new Date('2026-09-23T00:00:00Z');
    expect(
      toNotificationCreatedPayload(
        { id: 'n1', recipient_id: 'u1', created_at: createdAt },
        {
          eventId: 'e1',
          recipientIds: ['u1'],
          type: NotificationType.INFO,
          priority: NotificationPriority.NORMAL,
          title: 'T',
          message: 'M',
        },
      ),
    ).toStrictEqual({
      id: 'n1',
      type: NotificationType.INFO,
      priority: NotificationPriority.NORMAL,
      title: 'T',
      message: 'M',
      createdAt,
    });
  });
});

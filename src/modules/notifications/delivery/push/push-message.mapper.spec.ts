import { NotificationPriority } from '../../constants/notification-priority.enum';
import { NotificationResourceType } from '../../constants/notification-resource-type.enum';
import { NotificationType } from '../../constants/notification-type.enum';
import type { Notification } from '../../schemas/notification.schema';
import { toPushMessage } from './push-message.mapper';

const notification = (overrides: Partial<Notification> = {}): Notification => ({
  _id: 'n1',
  eventId: 'e1',
  recipientId: 'u1',
  type: NotificationType.WARNING,
  priority: NotificationPriority.URGENT,
  title: 'KHẨN: Ngựa Winx bị sốt',
  message: 'Thân nhiệt 39.5 °C',
  resource: { type: NotificationResourceType.HORSE, id: 'h1' },
  readAt: null,
  createdAt: new Date('2026-10-05T00:00:00Z'),
  ...overrides,
});

describe('toPushMessage', () => {
  it('builds a high priority push with the deep link in string data', () => {
    expect(toPushMessage(notification(), ['t1', 't2'])).toEqual({
      tokens: ['t1', 't2'],
      notification: {
        title: 'KHẨN: Ngựa Winx bị sốt',
        body: 'Thân nhiệt 39.5 °C',
      },
      data: {
        notificationId: 'n1',
        priority: 'URGENT',
        resourceType: 'HORSE',
        resourceId: 'h1',
      },
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    });
  });

  it('sends a normal notification at normal priority without resource keys when there is no resource', () => {
    const message = toPushMessage(
      notification({ priority: NotificationPriority.NORMAL, resource: null }),
      ['t1'],
    );

    expect(message.data).toEqual({ notificationId: 'n1', priority: 'NORMAL' });
    expect(message.android).toEqual({ priority: 'normal' });
    expect(message.apns).toEqual({ headers: { 'apns-priority': '5' } });
  });
});

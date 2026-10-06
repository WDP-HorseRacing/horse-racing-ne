import { decodeKeysetCursor } from '../../../common/utils/keyset-cursor';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';
import type { NotificationRecord } from '../schemas/notification.schema';
import {
  horseResource,
  toNotificationCreatedPayload,
  toNotificationPage,
  toNotificationResponse,
  toPushMessage,
} from './notification.mapper';

const createdAt = new Date('2026-10-05T00:00:00Z');

const notification = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  _id: 'n1',
  eventId: 'e1',
  recipientId: 'u1',
  category: NotificationCategory.MEASUREMENT_ALERT,
  priority: NotificationPriority.URGENT,
  title: 'KHẨN: Ngựa Winx bị sốt',
  message: 'Thân nhiệt 39.5 °C',
  resource: { type: NotificationResourceType.HORSE, id: 'h1' },
  readAt: null,
  createdAt,
  ...overrides,
});

describe('horseResource', () => {
  it('points to the horse profile', () => {
    expect(horseResource('h1')).toEqual({
      type: NotificationResourceType.HORSE,
      id: 'h1',
    });
  });
});

describe('toNotificationCreatedPayload', () => {
  it('sends only the fields the client displays', () => {
    expect(toNotificationCreatedPayload(notification())).toStrictEqual({
      id: 'n1',
      category: NotificationCategory.MEASUREMENT_ALERT,
      priority: NotificationPriority.URGENT,
      title: 'KHẨN: Ngựa Winx bị sốt',
      message: 'Thân nhiệt 39.5 °C',
      resource: { type: NotificationResourceType.HORSE, id: 'h1' },
      createdAt,
    });
  });
});

describe('toNotificationResponse', () => {
  it('adds the read time to the payload fields', () => {
    const readAt = new Date('2026-10-05T01:00:00Z');

    expect(toNotificationResponse(notification({ readAt }))).toMatchObject({
      id: 'n1',
      readAt,
    });
  });
});

describe('toNotificationPage', () => {
  it('returns a cursor to the last item when there are more rows than the limit', () => {
    const rows = [
      notification({ _id: 'a' }),
      notification({ _id: 'b' }),
      notification({ _id: 'c' }),
    ];

    const page = toNotificationPage(rows, 2);

    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(decodeKeysetCursor(page.nextCursor!)).toEqual({
      createdAt,
      id: 'b',
    });
  });

  it('returns no cursor on the last page', () => {
    expect(toNotificationPage([notification()], 2).nextCursor).toBeNull();
  });
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
        id: 'n1',
        category: 'MEASUREMENT_ALERT',
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

    expect(message.data).toEqual({
      id: 'n1',
      category: 'MEASUREMENT_ALERT',
      priority: 'NORMAL',
    });
    expect(message.android).toEqual({ priority: 'normal' });
    expect(message.apns).toEqual({ headers: { 'apns-priority': '5' } });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import type { Actor } from '../../src/common/types/actor';
import { NotificationPriority } from '../../src/modules/notifications/enums/notification-priority.enum';
import { NotificationCategory } from '../../src/modules/notifications/enums/notification-category.enum';
import { NotificationListQueryDto } from '../../src/modules/notifications/dto';
import { NotificationInboxService } from '../../src/modules/notifications/inbox/inbox.service';
import { NotificationAccessService } from '../../src/modules/notifications/shared/notification-access.service';
import {
  NotificationRecord,
  NotificationSchema,
} from '../../src/modules/notifications/schemas/notification.schema';
import {
  clearAllCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from './mongo';

describe('NotificationInboxService (MongoDB)', () => {
  let mongo: TestMongo;
  let model: Model<NotificationRecord>;
  let inbox: NotificationInboxService;
  const users = new Map<string, string>();

  beforeAll(async () => {
    mongo = await startTestMongo();
    model = mongo.connection.model(NotificationRecord.name, NotificationSchema);
    await model.init();
    const dataSource = {
      manager: {
        findOne: (
          _entity: unknown,
          options: { where: { keycloakId: string } },
        ) =>
          Promise.resolve({
            id: users.get(options.where.keycloakId),
            status: UserStatus.ACTIVE,
            role: UserRole.HEAD_TRAINER,
          }),
      },
    } as unknown as DataSource;
    inbox = new NotificationInboxService(
      model,
      new NotificationAccessService(model, dataSource),
    );
  });

  afterAll(() => stopTestMongo(mongo));

  beforeEach(async () => {
    await clearAllCollections(mongo.connection);
    users.clear();
  });

  /**
   * Tạo người dùng giả: trả về actor (theo Keycloak sub) và id tài khoản local
   */
  const user = () => {
    const sub = randomUUID();
    const id = randomUUID();
    users.set(sub, id);
    const actor: Actor = { sub, roles: [UserRole.HEAD_TRAINER] };
    return { actor, id };
  };

  const stored = (
    recipientId: string,
    createdAt: string,
    overrides: Partial<NotificationRecord> = {},
  ) =>
    model.create({
      _id: randomUUID(),
      eventId: randomUUID(),
      recipientId,
      category: NotificationCategory.BARN_ASSIGNED,
      priority: NotificationPriority.NORMAL,
      title: `T ${createdAt}`,
      message: 'M',
      resource: null,
      readAt: null,
      createdAt: new Date(createdAt),
      ...overrides,
    });

  const query = (values: Partial<NotificationListQueryDto> = {}) =>
    Object.assign(new NotificationListQueryDto(), values);

  describe('list', () => {
    it('pages newest first without repeating items when new notifications arrive between pages', async () => {
      const me = user();
      for (let minute = 0; minute < 5; minute++) {
        await stored(me.id, `2026-10-05T00:0${minute}:00Z`);
      }

      const first = await inbox.list(me.actor, query({ limit: 2 }));
      await stored(me.id, '2026-10-05T01:00:00Z');
      await stored(me.id, '2026-10-05T01:01:00Z');
      const second = await inbox.list(
        me.actor,
        query({ limit: 2, cursor: first.nextCursor! }),
      );
      const third = await inbox.list(
        me.actor,
        query({ limit: 2, cursor: second.nextCursor! }),
      );

      expect(first.items.map((n) => n.title)).toEqual([
        'T 2026-10-05T00:04:00Z',
        'T 2026-10-05T00:03:00Z',
      ]);
      expect(second.items.map((n) => n.title)).toEqual([
        'T 2026-10-05T00:02:00Z',
        'T 2026-10-05T00:01:00Z',
      ]);
      expect(third.items.map((n) => n.title)).toEqual([
        'T 2026-10-05T00:00:00Z',
      ]);
      expect(third.nextCursor).toBeNull();
    });

    it('keeps every notification exactly once when several share the same createdAt', async () => {
      const me = user();
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((await stored(me.id, '2026-10-05T00:00:00Z'))._id);
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await inbox.list(me.actor, query({ limit: 2, cursor }));
        seen.push(...page.items.map((n) => n.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      expect(seen).toHaveLength(5);
      expect([...seen].sort()).toEqual([...ids].sort());
    });

    it('lists only the caller notifications and applies unreadOnly and priority filters', async () => {
      const me = user();
      const other = user();
      await stored(me.id, '2026-10-05T00:00:00Z', {
        priority: NotificationPriority.URGENT,
      });
      await stored(me.id, '2026-10-05T00:01:00Z', {
        priority: NotificationPriority.URGENT,
        readAt: new Date('2026-10-05T02:00:00Z'),
      });
      await stored(me.id, '2026-10-05T00:02:00Z');
      await stored(other.id, '2026-10-05T00:03:00Z', {
        priority: NotificationPriority.URGENT,
      });

      const all = await inbox.list(me.actor, query());
      const urgentUnread = await inbox.list(
        me.actor,
        query({ unreadOnly: true, priority: NotificationPriority.URGENT }),
      );

      expect(all.items).toHaveLength(3);
      expect(all.nextCursor).toBeNull();
      expect(urgentUnread.items.map((n) => n.title)).toEqual([
        'T 2026-10-05T00:00:00Z',
      ]);
    });

    it('returns the response shape without internal fields', async () => {
      const me = user();
      const created = await stored(me.id, '2026-10-05T00:00:00Z', {
        resource: { type: 'HORSE', id: 'h1' } as NotificationRecord['resource'],
      });

      const page = await inbox.list(me.actor, query());

      expect(page.items).toEqual([
        {
          id: created._id,
          category: NotificationCategory.BARN_ASSIGNED,
          priority: NotificationPriority.NORMAL,
          title: 'T 2026-10-05T00:00:00Z',
          message: 'M',
          resource: { type: 'HORSE', id: 'h1' },
          readAt: null,
          createdAt: new Date('2026-10-05T00:00:00Z'),
        },
      ]);
    });

    it('rejects a malformed cursor', async () => {
      const me = user();

      await expect(
        inbox.list(me.actor, query({ cursor: 'not-a-cursor' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses the recipient indexes instead of scanning the collection', async () => {
      const me = user();
      await stored(me.id, '2026-10-05T00:00:00Z');

      const plan = async (filter: Record<string, unknown>) =>
        JSON.stringify(
          await model
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .explain('queryPlanner'),
        );

      expect(await plan({ recipientId: me.id })).toContain(
        'notifications_recipient_created_idx',
      );
      expect(await plan({ recipientId: me.id, readAt: null })).toContain(
        'notifications_recipient_unread_idx',
      );
      expect(await plan({ recipientId: me.id })).not.toContain('COLLSCAN');
    });
  });

  describe('unreadCount', () => {
    it('counts only unread notifications of the caller', async () => {
      const me = user();
      const other = user();
      await stored(me.id, '2026-10-05T00:00:00Z');
      await stored(me.id, '2026-10-05T00:01:00Z', { readAt: new Date() });
      await stored(other.id, '2026-10-05T00:02:00Z');

      await expect(inbox.unreadCount(me.actor)).resolves.toEqual({ count: 1 });
    });
  });

  describe('get', () => {
    it('returns 404 for a notification of another user', async () => {
      const me = user();
      const other = user();
      const theirs = await stored(other.id, '2026-10-05T00:00:00Z');

      await expect(inbox.get(me.actor, theirs._id)).rejects.toThrow(
        NotFoundException,
      );
      await expect(inbox.get(other.actor, theirs._id)).resolves.toMatchObject({
        id: theirs._id,
      });
    });
  });

  describe('markRead', () => {
    it('marks once and keeps the first read time on a second call', async () => {
      const me = user();
      const mine = await stored(me.id, '2026-10-05T00:00:00Z');

      const first = await inbox.markRead(me.actor, mine._id);
      const second = await inbox.markRead(me.actor, mine._id);

      expect(first.readAt).toBeInstanceOf(Date);
      expect(second.readAt).toEqual(first.readAt);
    });

    it('returns 404 and changes nothing for a notification of another user', async () => {
      const me = user();
      const other = user();
      const theirs = await stored(other.id, '2026-10-05T00:00:00Z');

      await expect(inbox.markRead(me.actor, theirs._id)).rejects.toThrow(
        NotFoundException,
      );
      expect((await model.findById(theirs._id).lean())!.readAt).toBeNull();
    });

    it('returns 404 for an unknown id', async () => {
      const me = user();

      await expect(inbox.markRead(me.actor, randomUUID())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllRead', () => {
    it('marks only the caller unread notifications and reports how many changed', async () => {
      const me = user();
      const other = user();
      const readAt = new Date('2026-10-05T02:00:00Z');
      await stored(me.id, '2026-10-05T00:00:00Z');
      await stored(me.id, '2026-10-05T00:01:00Z');
      const alreadyRead = await stored(me.id, '2026-10-05T00:02:00Z', {
        readAt,
      });
      const theirs = await stored(other.id, '2026-10-05T00:03:00Z');

      await expect(inbox.markAllRead(me.actor)).resolves.toEqual({
        count: 2,
      });
      await expect(inbox.unreadCount(me.actor)).resolves.toEqual({ count: 0 });
      expect((await model.findById(alreadyRead._id).lean())!.readAt).toEqual(
        readAt,
      );
      expect((await model.findById(theirs._id).lean())!.readAt).toBeNull();
    });
  });
});

import type { SendResponse } from 'firebase-admin/messaging';
import { classifyPushFailures } from './notification-push.policy';

const ok = (): SendResponse => ({ success: true, messageId: 'm' });
const fail = (code?: string): SendResponse =>
  ({
    success: false,
    error: code ? { code, message: code } : undefined,
  }) as SendResponse;

describe('classifyPushFailures', () => {
  it('splits failed tokens into dead, retry and other failures', () => {
    expect(
      classifyPushFailures(
        ['ok', 'dead1', 'dead2', 'retry', 'bad', 'unknown'],
        [
          ok(),
          fail('messaging/registration-token-not-registered'),
          fail('messaging/invalid-registration-token'),
          fail('messaging/server-unavailable'),
          fail('messaging/invalid-argument'),
          fail(),
        ],
      ),
    ).toEqual({
      dead: ['dead1', 'dead2'],
      retry: ['retry', 'unknown'],
      failed: [
        {
          token: 'bad',
          code: 'messaging/invalid-argument',
          message: 'messaging/invalid-argument',
        },
      ],
    });
  });

  it('returns empty lists when every token succeeded', () => {
    expect(classifyPushFailures(['a'], [ok()])).toEqual({
      dead: [],
      retry: [],
      failed: [],
    });
  });
});

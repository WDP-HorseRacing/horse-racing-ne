import { BadRequestException } from '@nestjs/common';
import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-cursor';

describe('keyset cursor', () => {
  it('decodes what it encodes', () => {
    const cursor = {
      createdAt: new Date('2026-10-05T01:02:03.456Z'),
      id: '3f0c7c1e-8a52-4b54-9b1e-2f4f1b0a9c11',
    };

    expect(decodeKeysetCursor(encodeKeysetCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['not base64 of the expected shape', 'abc'],
    [
      'missing id',
      Buffer.from('2026-10-05T00:00:00.000Z|').toString('base64url'),
    ],
    ['missing time', Buffer.from('|some-id').toString('base64url')],
    ['invalid time', Buffer.from('yesterday|some-id').toString('base64url')],
  ])('rejects a cursor with %s', (_case, value) => {
    expect(() => decodeKeysetCursor(value)).toThrow(BadRequestException);
  });
});

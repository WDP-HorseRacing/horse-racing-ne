import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  mapAnyUniqueViolation,
  mapUniqueViolation,
  PG_UNIQUE_VIOLATION,
} from './unique-violation';

function queryError(code: string, constraint?: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code,
    constraint,
  } as unknown as Error);
}

describe('mapUniqueViolation', () => {
  const messages = { horses_microchip_uq: 'Số chip đã được dùng' };

  it('returns the operation result when nothing fails', async () => {
    await expect(
      mapUniqueViolation(() => Promise.resolve('ok'), messages),
    ).resolves.toBe('ok');
  });

  it('maps a known unique constraint to a 409 with its message', async () => {
    await expect(
      mapUniqueViolation(
        () =>
          Promise.reject(
            queryError(PG_UNIQUE_VIOLATION, 'horses_microchip_uq'),
          ),
        messages,
      ),
    ).rejects.toEqual(new ConflictException('Số chip đã được dùng'));
  });

  it('rethrows a unique violation on an unknown constraint', async () => {
    const error = queryError(PG_UNIQUE_VIOLATION, 'other_uq');
    await expect(
      mapUniqueViolation(() => Promise.reject(error), messages),
    ).rejects.toBe(error);
  });

  it('rethrows other database errors', async () => {
    const error = queryError('23503', 'horses_microchip_uq');
    await expect(
      mapUniqueViolation(() => Promise.reject(error), messages),
    ).rejects.toBe(error);
  });
});

describe('mapAnyUniqueViolation', () => {
  it('maps any unique violation to a 409 with the given message', async () => {
    await expect(
      mapAnyUniqueViolation(
        () => Promise.reject(queryError(PG_UNIQUE_VIOLATION)),
        'Tên khu chuồng đã tồn tại',
      ),
    ).rejects.toEqual(new ConflictException('Tên khu chuồng đã tồn tại'));
  });

  it('rethrows errors that are not unique violations', async () => {
    const error = new Error('boom');
    await expect(
      mapAnyUniqueViolation(() => Promise.reject(error), 'x'),
    ).rejects.toBe(error);
  });
});

import { deterministicUuid } from './deterministic-uuid';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deterministicUuid', () => {
  it('returns the same UUID for the same key', () => {
    expect(deterministicUuid('checkup-overdue:h1:2026-10-01')).toBe(
      deterministicUuid('checkup-overdue:h1:2026-10-01'),
    );
  });

  it('returns different UUIDs for different keys', () => {
    expect(deterministicUuid('checkup-overdue:h1:2026-10-01')).not.toBe(
      deterministicUuid('checkup-overdue:h1:2026-10-31'),
    );
  });

  it('returns a valid version 5 UUID', () => {
    expect(deterministicUuid('any-key')).toMatch(UUID_PATTERN);
  });
});

import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('rejects a missing database URL', () => {
    expect(() => validateEnvironment({ PORT: '3000' })).toThrow(
      'DATABASE_URL is required',
    );
  });

  it('normalizes a valid port', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: 'postgres://localhost/test',
        PORT: '3001',
      }).PORT,
    ).toBe(3001);
  });
});

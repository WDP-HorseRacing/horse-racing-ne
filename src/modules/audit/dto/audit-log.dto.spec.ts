import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditLogListQueryDto } from './audit-log.dto';

async function failedFields(query: object): Promise<string[]> {
  const errors = await validate(plainToInstance(AuditLogListQueryDto, query));
  return errors.map((error) => error.property);
}

describe('AuditLogListQueryDto', () => {
  it('accepts real calendar dates', async () => {
    await expect(
      failedFields({ from: '2026-02-28', to: '2026-10-01' }),
    ).resolves.toEqual([]);
  });

  it('rejects dates that do not exist on the calendar', async () => {
    await expect(
      failedFields({ from: '2026-02-30', to: '2026-13-45' }),
    ).resolves.toEqual(['from', 'to']);
  });

  it('accepts a known feature and rejects an unknown one', async () => {
    await expect(failedFields({ feature: 'HORSE_OWNER' })).resolves.toEqual([]);
    await expect(failedFields({ feature: 'F1.3' })).resolves.toEqual([
      'feature',
    ]);
  });
});

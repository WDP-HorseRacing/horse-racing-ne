import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDailyFeeDto } from './daily-fee.dto';

const strict = { whitelist: true, forbidNonWhitelisted: true };

async function failedFields(body: object): Promise<string[]> {
  const errors = await validate(
    plainToInstance(UpdateDailyFeeDto, body),
    strict,
  );
  return errors.map((error) => error.property);
}

describe('UpdateDailyFeeDto', () => {
  it('accepts an amount with a trimmed reason', async () => {
    const dto = plainToInstance(UpdateDailyFeeDto, {
      dailyFee: 250000,
      reason: '  Nhập nhầm  ',
    });

    await expect(validate(dto, strict)).resolves.toEqual([]);
    expect(dto.reason).toBe('Nhập nhầm');
  });

  it('requires both the amount and a non-blank reason', async () => {
    await expect(failedFields({ reason: 'Sửa' })).resolves.toEqual([
      'dailyFee',
    ]);
    await expect(
      failedFields({ dailyFee: 250000, reason: '   ' }),
    ).resolves.toEqual(['reason']);
    await expect(
      failedFields({ dailyFee: -1, reason: 'Sửa' }),
    ).resolves.toEqual(['dailyFee']);
  });

  it('rejects an effective date in the body', async () => {
    await expect(
      failedFields({
        dailyFee: 250000,
        reason: 'Sửa',
        effectiveFrom: '2026-10-20',
      }),
    ).resolves.toEqual(['effectiveFrom']);
  });
});

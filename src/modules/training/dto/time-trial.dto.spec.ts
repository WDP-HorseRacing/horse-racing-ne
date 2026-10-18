import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateTimeTrialDto,
  CreateTrialResultDto,
  UpdateTimeTrialDto,
  UpdateTrialResultDto,
} from './time-trial.dto';

const VIDEO_ID = '11111111-1111-4111-8111-111111111111';

async function failedFields(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateTrialResultDto, body));
  return errors.map((error) => error.property);
}

describe('UpdateTrialResultDto', () => {
  it('accepts a uuid or null for the video without a reason', async () => {
    await expect(failedFields({ videoMediaId: VIDEO_ID })).resolves.toEqual([]);
    await expect(failedFields({ videoMediaId: null })).resolves.toEqual([]);
  });

  it('accepts an empty body', async () => {
    await expect(failedFields({})).resolves.toEqual([]);
  });

  it('rejects a non-uuid video', async () => {
    await expect(failedFields({ videoMediaId: 'abc' })).resolves.toEqual([
      'videoMediaId',
    ]);
  });

  it('accepts a time or notes correction with a trimmed reason', async () => {
    const dto = plainToInstance(UpdateTrialResultDto, {
      elapsedMs: 59000,
      notes: null,
      reason: '  Nhập nhầm  ',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.reason).toBe('Nhập nhầm');
  });

  it.each([
    { elapsedMs: 59000 },
    { notes: 'x' },
    { notes: null },
    { elapsedMs: 59000, reason: '   ' },
    { notes: 'x', reason: 'x'.repeat(501) },
  ])('requires a non-blank reason up to 500 chars: %j', async (body) => {
    await expect(failedFields(body)).resolves.toEqual(['reason']);
  });

  it.each([0, 1.5, null, 3_600_001])(
    'rejects elapsedMs %p',
    async (elapsedMs) => {
      await expect(failedFields({ elapsedMs, reason: 'x' })).resolves.toEqual([
        'elapsedMs',
      ]);
    },
  );
});

describe('trial time caps', () => {
  it.each([
    [
      'CreateTimeTrialDto.targetTimeMs',
      CreateTimeTrialDto,
      { distanceM: 1000 },
      'targetTimeMs',
    ],
    ['UpdateTimeTrialDto.targetTimeMs', UpdateTimeTrialDto, {}, 'targetTimeMs'],
    [
      'CreateTrialResultDto.elapsedMs',
      CreateTrialResultDto,
      { attemptNo: 1 },
      'elapsedMs',
    ],
  ] as const)(
    'accepts %s at one hour and rejects longer with a Vietnamese message',
    async (_case, type, base, field) => {
      await expect(
        validate(plainToInstance(type, { ...base, [field]: 3_600_000 })),
      ).resolves.toEqual([]);
      const errors = await validate(
        plainToInstance(type, { ...base, [field]: 3_600_001 }),
      );
      expect(errors.map((error) => error.property)).toEqual([field]);
      expect(Object.values(errors[0].constraints ?? {})).toEqual([
        'Thời gian tối đa 3.600.000 ms (1 giờ)',
      ]);
    },
  );
});

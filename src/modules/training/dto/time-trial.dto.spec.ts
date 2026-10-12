import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateTimeTrialDto,
  CreateTrialResultDto,
  UpdateTimeTrialDto,
  UpdateTrialResultVideoDto,
} from './time-trial.dto';

const VIDEO_ID = '11111111-1111-4111-8111-111111111111';

async function failedFields(body: object): Promise<string[]> {
  const errors = await validate(
    plainToInstance(UpdateTrialResultVideoDto, body),
  );
  return errors.map((error) => error.property);
}

describe('UpdateTrialResultVideoDto', () => {
  it('accepts a uuid', async () => {
    await expect(failedFields({ videoMediaId: VIDEO_ID })).resolves.toEqual([]);
  });

  it('accepts null to remove the video', async () => {
    await expect(failedFields({ videoMediaId: null })).resolves.toEqual([]);
  });

  it('rejects a missing field and a non-uuid string', async () => {
    await expect(failedFields({})).resolves.toEqual(['videoMediaId']);
    await expect(failedFields({ videoMediaId: 'abc' })).resolves.toEqual([
      'videoMediaId',
    ]);
  });
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

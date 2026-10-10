import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTrialResultVideoDto } from './time-trial.dto';

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

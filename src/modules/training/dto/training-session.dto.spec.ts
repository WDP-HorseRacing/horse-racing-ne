import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import {
  CreateTrainingSessionDto,
  UpdateTrainingSessionDto,
} from './training-session.dto';

async function failedFields(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

function create(overrides: Record<string, unknown>): CreateTrainingSessionDto {
  return plainToInstance(CreateTrainingSessionDto, {
    name: 'Buổi 1',
    sessionType: TrainingSessionType.REGULAR,
    scheduledStartAt: '2026-10-10T01:00:00Z',
    scheduledEndAt: '2026-10-10T02:00:00Z',
    intensity: TrainingIntensity.MODERATE,
    plannedDistanceM: 3000,
    ...overrides,
  });
}

describe('CreateTrainingSessionDto', () => {
  it('accepts a session with intensity and planned distance', async () => {
    await expect(failedFields(create({}))).resolves.toEqual([]);
  });

  it.each([
    ['missing', undefined],
    ['negative', -1],
    ['too long', 20001],
    ['fractional', 1500.5],
  ])('rejects a %s planned distance', async (_case, plannedDistanceM) => {
    await expect(failedFields(create({ plannedDistanceM }))).resolves.toEqual([
      'plannedDistanceM',
    ]);
  });

  it('rejects a missing intensity', async () => {
    await expect(
      failedFields(create({ intensity: undefined })),
    ).resolves.toEqual(['intensity']);
  });
});

describe('UpdateTrainingSessionDto', () => {
  it('accepts an update without planned distance', async () => {
    await expect(
      failedFields(plainToInstance(UpdateTrainingSessionDto, { name: 'Mới' })),
    ).resolves.toEqual([]);
  });
});

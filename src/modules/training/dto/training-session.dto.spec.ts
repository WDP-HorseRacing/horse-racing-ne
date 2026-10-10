import { randomUUID } from 'node:crypto';
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
    subjectId: randomUUID(),
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

  it('rejects a missing subject', async () => {
    await expect(
      failedFields(create({ subjectId: undefined })),
    ).resolves.toEqual(['subjectId']);
  });

  it('accepts a session without session type', async () => {
    await expect(
      failedFields(create({ sessionType: undefined })),
    ).resolves.toEqual([]);
  });

  it.each([
    ['null', null, []],
    ['positive', 62000, []],
    ['zero', 0, ['targetTimeMs']],
    ['fractional', 1.5, ['targetTimeMs']],
  ])('validates a %s target time', async (_case, targetTimeMs, fields) => {
    await expect(failedFields(create({ targetTimeMs }))).resolves.toEqual(
      fields,
    );
  });
});

describe('UpdateTrainingSessionDto', () => {
  it('accepts an update without planned distance', async () => {
    await expect(
      failedFields(plainToInstance(UpdateTrainingSessionDto, { name: 'Mới' })),
    ).resolves.toEqual([]);
  });

  it('does not accept a target time', async () => {
    const errors = await validate(
      plainToInstance(UpdateTrainingSessionDto, { targetTimeMs: 62000 }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property)).toEqual(['targetTimeMs']);
  });
});

describe('Training session text length limits', () => {
  it.each([
    ['name', 160, 'Tên buổi tập tối đa 160 ký tự'],
    ['location', 160, 'Địa điểm tối đa 160 ký tự'],
    ['surface', 80, 'Mặt sân tối đa 80 ký tự'],
  ])(
    'accepts %s at the column length and rejects longer with a Vietnamese message',
    async (field, max, message) => {
      await expect(
        failedFields(create({ [field]: 'a'.repeat(max) })),
      ).resolves.toEqual([]);
      const errors = await validate(create({ [field]: 'a'.repeat(max + 1) }));
      expect(errors.map((error) => error.property)).toEqual([field]);
      expect(Object.values(errors[0].constraints ?? {})).toEqual([message]);
      const update = plainToInstance(UpdateTrainingSessionDto, {
        [field]: 'a'.repeat(max + 1),
      });
      await expect(failedFields(update)).resolves.toEqual([field]);
    },
  );
});

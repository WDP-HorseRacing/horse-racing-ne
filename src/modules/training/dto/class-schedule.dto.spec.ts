import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { ClassSessionInputDto } from './class-schedule.dto';

function session(overrides: Record<string, unknown>): ClassSessionInputDto {
  return plainToInstance(ClassSessionInputDto, {
    subjectId: randomUUID(),
    name: 'Buổi 1',
    intensity: TrainingIntensity.MODERATE,
    scheduledStartAt: '2026-10-10T01:00:00Z',
    scheduledEndAt: '2026-10-10T02:00:00Z',
    plannedDistanceM: 3000,
    ...overrides,
  });
}

describe('ClassSessionInputDto text length limits', () => {
  it.each([
    ['name', 160, 'Tên buổi tập tối đa 160 ký tự'],
    ['location', 160, 'Địa điểm tối đa 160 ký tự'],
    ['surface', 80, 'Mặt sân tối đa 80 ký tự'],
  ])(
    'accepts %s at the column length and rejects longer with a Vietnamese message',
    async (field, max, message) => {
      await expect(
        validate(session({ [field]: 'a'.repeat(max) })),
      ).resolves.toEqual([]);
      const errors = await validate(session({ [field]: 'a'.repeat(max + 1) }));
      expect(errors.map((error) => error.property)).toEqual([field]);
      expect(Object.values(errors[0].constraints ?? {})).toEqual([message]);
    },
  );
});

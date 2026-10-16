import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { CreateTrainingSubjectDto } from './training-subject.dto';

function subject(
  targetTimeMs: number,
  durationMinutes: number | undefined,
): CreateTrainingSubjectDto {
  return plainToInstance(CreateTrainingSubjectDto, {
    name: 'Chạy thử 1000m',
    sessionType: TrainingSessionType.TIME_TRIAL,
    intensity: TrainingIntensity.HEAVY,
    plannedDistanceM: 1000,
    durationMinutes,
    targetTimeMs,
  });
}

describe('CreateTrainingSubjectDto target time', () => {
  it('accepts one hour and rejects longer', async () => {
    await expect(validate(subject(3_600_000, 30))).resolves.toEqual([]);
    const errors = await validate(subject(3_600_001, 30));
    expect(errors.map((error) => error.property)).toEqual(['targetTimeMs']);
  });
});

describe('CreateTrainingSubjectDto duration', () => {
  it('requires a duration from 15 to 480 minutes', async () => {
    await expect(validate(subject(60_000, 15))).resolves.toEqual([]);
    await expect(validate(subject(60_000, 480))).resolves.toEqual([]);
    for (const durationMinutes of [undefined, 14, 481]) {
      const errors = await validate(subject(60_000, durationMinutes));
      expect(errors.map((error) => error.property)).toEqual([
        'durationMinutes',
      ]);
    }
  });
});

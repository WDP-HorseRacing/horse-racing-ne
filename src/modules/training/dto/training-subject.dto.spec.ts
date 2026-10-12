import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { CreateTrainingSubjectDto } from './training-subject.dto';

function subject(targetTimeMs: number): CreateTrainingSubjectDto {
  return plainToInstance(CreateTrainingSubjectDto, {
    name: 'Chạy thử 1000m',
    sessionType: TrainingSessionType.TIME_TRIAL,
    intensity: TrainingIntensity.HEAVY,
    plannedDistanceM: 1000,
    targetTimeMs,
  });
}

describe('CreateTrainingSubjectDto target time', () => {
  it('accepts one hour and rejects longer', async () => {
    await expect(validate(subject(3_600_000))).resolves.toEqual([]);
    const errors = await validate(subject(3_600_001));
    expect(errors.map((error) => error.property)).toEqual(['targetTimeMs']);
  });
});

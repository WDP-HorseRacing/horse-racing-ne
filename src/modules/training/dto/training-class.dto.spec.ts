import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateTrainingClassDto,
  UpdateTrainingClassDto,
} from './training-class.dto';

const valid = {
  code: 'TC-1',
  name: 'Lớp 1',
  planId: '7f1c1d0e-3f4a-4b57-9f0c-2f6f8b9b6a11',
  startDate: '2026-10-10',
  endDate: '2026-12-10',
};

async function constraintsOf(dto: object): Promise<Record<string, string[]>> {
  const errors = await validate(dto);
  return Object.fromEntries(
    errors.map((error) => [
      error.property,
      Object.values(error.constraints ?? {}),
    ]),
  );
}

describe('Training class text length limits', () => {
  it.each([
    ['code', 32, 'Mã lớp tối đa 32 ký tự'],
    ['name', 160, 'Tên lớp tối đa 160 ký tự'],
  ])(
    'accepts %s at the column length and rejects longer with a Vietnamese message',
    async (field, max, message) => {
      const at = plainToInstance(CreateTrainingClassDto, {
        ...valid,
        [field]: 'a'.repeat(max),
      });
      expect((await constraintsOf(at))[field]).toBeUndefined();
      const over = plainToInstance(CreateTrainingClassDto, {
        ...valid,
        [field]: 'a'.repeat(max + 1),
      });
      expect((await constraintsOf(over))[field]).toEqual([message]);
      const update = plainToInstance(UpdateTrainingClassDto, {
        [field]: 'a'.repeat(max + 1),
      });
      expect((await constraintsOf(update))[field]).toEqual([message]);
    },
  );
});

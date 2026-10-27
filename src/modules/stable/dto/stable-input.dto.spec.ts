import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCareTaskTypeDto,
  CreateHorseCareTaskDto,
  UpdateCareTaskTypeDto,
} from './care-task.dto';
import { CreateBarnDto, UpdateBarnDto } from './barn.dto';
import { DailyChecklistQueryDto } from './daily-checklist.dto';
import { ReportIncidentDto, ResolveIncidentDto } from './incident.dto';
import { CreateStallDto, UpdateStallDto } from './stall.dto';

const HORSE_ID = '11111111-1111-4111-8111-111111111111';

async function failedFields(
  dto: ClassConstructor<object>,
  body: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body));
  return errors.map((error) => error.property);
}

describe('stable DTO text fields', () => {
  it.each([
    [ReportIncidentDto, { horseId: HORSE_ID, description: '   ' }],
    [ResolveIncidentDto, { resolution: '   ' }],
    [CreateCareTaskTypeDto, { name: '   ', appliesToAll: false }],
    [UpdateCareTaskTypeDto, { name: '   ' }],
    [CreateBarnDto, { name: '   ' }],
    [UpdateBarnDto, { name: '   ' }],
    [CreateStallDto, { barnId: HORSE_ID, code: '   ' }],
    [UpdateStallDto, { code: '   ' }],
  ])('%p rejects a whitespace-only text', async (dto, body) => {
    await expect(failedFields(dto, body)).resolves.toHaveLength(1);
  });

  it('trims the text before saving', () => {
    const body = plainToInstance(ResolveIncidentDto, {
      resolution: '  Đã băng  ',
    });
    expect(body.resolution).toBe('Đã băng');
  });
});

describe('stable DTO date-only fields', () => {
  const careTask = {
    taskTypeId: HORSE_ID,
    fromDate: '2026-10-10',
    toDate: '2026-10-12',
  };

  it('accepts YYYY-MM-DD', async () => {
    await expect(
      failedFields(CreateHorseCareTaskDto, careTask),
    ).resolves.toEqual([]);
    await expect(
      failedFields(DailyChecklistQueryDto, {
        from: '2026-10-10',
        to: '2026-10-12',
      }),
    ).resolves.toEqual([]);
  });

  it.each(['2026-10', '2026-10-10T00:00:00Z'])('rejects %s', async (value) => {
    await expect(
      failedFields(CreateHorseCareTaskDto, {
        ...careTask,
        fromDate: value,
        toDate: value,
      }),
    ).resolves.toEqual(['fromDate', 'toDate']);
    await expect(
      failedFields(DailyChecklistQueryDto, { from: value, to: value }),
    ).resolves.toEqual(['from', 'to']);
  });
});

describe('CreateStallDto type', () => {
  it('rejects the dropped FOALING type', async () => {
    await expect(
      failedFields(CreateStallDto, {
        barnId: HORSE_ID,
        code: 'A-01',
        type: 'FOALING',
      }),
    ).resolves.toEqual(['type']);
  });
});

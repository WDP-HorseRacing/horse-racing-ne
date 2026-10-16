import { BadRequestException } from '@nestjs/common';
import { assertPlanPhases, phaseMinMinutes } from './training-plan.policy';

function errorOf(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse();
  }
  throw new Error('expected a BadRequestException');
}

describe('assertPlanPhases', () => {
  it('accepts several subjects in one phase and the same subject in another phase', () => {
    expect(() =>
      assertPlanPhases([
        { weeks: 4, subjects: [{ subjectId: 'a' }, { subjectId: 'b' }] },
        { weeks: 2, subjects: [{ subjectId: 'a' }] },
      ]),
    ).not.toThrow();
  });

  it('rejects the same subject twice in one phase', () => {
    expect(
      errorOf(() =>
        assertPlanPhases([
          { weeks: 1, subjects: [{ subjectId: 'a' }, { subjectId: 'a' }] },
        ]),
      ),
    ).toEqual({
      message: 'Giai đoạn 1: môn học bị lặp',
      errors: [
        {
          field: 'phases.0.subjects.1.subjectId',
          message: 'Giai đoạn 1: môn học bị lặp',
        },
      ],
    });
  });

  it('accepts 104 weeks in total and rejects 105', () => {
    const phase = (weeks: number) => ({
      weeks,
      subjects: [{ subjectId: 'a' }],
    });

    expect(() => assertPlanPhases([phase(52), phase(52)])).not.toThrow();
    expect(
      errorOf(() => assertPlanPhases([phase(52), phase(52), phase(1)])),
    ).toEqual({
      message: 'Tổng số tuần của giáo án không quá 104',
      errors: [
        {
          field: 'phases',
          message: 'Tổng số tuần của giáo án không quá 104',
        },
      ],
    });
  });
});

describe('phaseMinMinutes', () => {
  it('multiplies weeks by the minimum sessions and durations of every subject', () => {
    expect(
      phaseMinMinutes({
        weeks: 4,
        subjects: [
          { minSessionsPerWeek: 3, subject: { durationMinutes: 60 } },
          { minSessionsPerWeek: 1, subject: { durationMinutes: 30 } },
        ],
      }),
    ).toBe(4 * (3 * 60 + 30));
  });
});

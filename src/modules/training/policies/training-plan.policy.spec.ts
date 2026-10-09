import { BadRequestException } from '@nestjs/common';
import { assertPlanPhases } from './training-plan.policy';

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
  it('accepts several subjects on different weekdays in one phase', () => {
    expect(() =>
      assertPlanPhases([
        {
          weeks: 4,
          subjects: [
            { subjectId: 'a', weekdays: [1, 3, 5] },
            { subjectId: 'b', weekdays: [2, 4] },
          ],
        },
        { weeks: 2, subjects: [{ subjectId: 'a', weekdays: [1, 2, 3] }] },
      ]),
    ).not.toThrow();
  });

  it('rejects a weekday chosen for two subjects in the same phase', () => {
    expect(
      errorOf(() =>
        assertPlanPhases([
          { weeks: 1, subjects: [{ subjectId: 'a', weekdays: [1] }] },
          {
            weeks: 1,
            subjects: [
              { subjectId: 'a', weekdays: [1, 7] },
              { subjectId: 'b', weekdays: [2, 7] },
            ],
          },
        ]),
      ),
    ).toEqual({
      message: 'Giai đoạn 2: Chủ nhật bị chọn cho hơn một môn',
      errors: [
        {
          field: 'phases.1.subjects.1.weekdays',
          message: 'Giai đoạn 2: Chủ nhật bị chọn cho hơn một môn',
        },
      ],
    });
  });

  it('names Monday for weekday 1', () => {
    expect(
      errorOf(() =>
        assertPlanPhases([
          {
            weeks: 1,
            subjects: [
              { subjectId: 'a', weekdays: [1] },
              { subjectId: 'b', weekdays: [1] },
            ],
          },
        ]),
      ),
    ).toMatchObject({
      message: 'Giai đoạn 1: Thứ Hai bị chọn cho hơn một môn',
    });
  });

  it('rejects the same subject twice in one phase', () => {
    expect(
      errorOf(() =>
        assertPlanPhases([
          {
            weeks: 1,
            subjects: [
              { subjectId: 'a', weekdays: [1] },
              { subjectId: 'a', weekdays: [2] },
            ],
          },
        ]),
      ),
    ).toEqual({
      message: 'Giai đoạn 1: môn học bị lặp, gộp thứ vào một dòng',
      errors: [
        {
          field: 'phases.0.subjects.1.subjectId',
          message: 'Giai đoạn 1: môn học bị lặp, gộp thứ vào một dòng',
        },
      ],
    });
  });

  it('accepts 104 weeks in total and rejects 105', () => {
    const phase = (weeks: number) => ({
      weeks,
      subjects: [{ subjectId: 'a', weekdays: [1] }],
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

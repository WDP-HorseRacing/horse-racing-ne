import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePerformanceEvaluationDto } from './performance-evaluation.dto';

async function updateInput(body: object) {
  const dto = plainToInstance(UpdatePerformanceEvaluationDto, body);
  const errors = await validate(dto);
  return { dto, fields: errors.map((error) => error.property) };
}

describe('UpdatePerformanceEvaluationDto', () => {
  it('accepts a new score and a null comment with a trimmed reason', async () => {
    const { dto, fields } = await updateInput({
      score: 10,
      comment: null,
      reason: '  Chấm nhầm  ',
    });

    expect(fields).toEqual([]);
    expect(dto.reason).toBe('Chấm nhầm');
  });

  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }])(
    'rejects a missing, blank or too long reason: %j',
    async (body) => {
      await expect(updateInput(body)).resolves.toMatchObject({
        fields: ['reason'],
      });
    },
  );

  it.each([0, 11, 7.5, null])('rejects score %p', async (score) => {
    await expect(updateInput({ score, reason: 'x' })).resolves.toMatchObject({
      fields: ['score'],
    });
  });
});

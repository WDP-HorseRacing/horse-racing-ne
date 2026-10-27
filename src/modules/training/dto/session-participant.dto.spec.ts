import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StopParticipantDto } from './session-participant.dto';

async function stopInput(body: object) {
  const dto = plainToInstance(StopParticipantDto, body);
  const errors = await validate(dto);
  return { dto, fields: errors.map((error) => error.property) };
}

describe('StopParticipantDto', () => {
  it('trims the reason', async () => {
    const { dto, fields } = await stopInput({ reason: '  Ngựa đau  ' });

    expect(fields).toEqual([]);
    expect(dto.reason).toBe('Ngựa đau');
  });

  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }])(
    'rejects a missing, blank or too long reason: %j',
    async (body) => {
      await expect(stopInput(body)).resolves.toMatchObject({
        fields: ['reason'],
      });
    },
  );
});

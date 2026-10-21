import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/utils/field-errors';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { HorseTrainingSessionQueryDto } from './horse-training.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});

const parse = (query: Record<string, unknown>) =>
  pipe.transform(query, {
    type: 'query',
    metatype: HorseTrainingSessionQueryDto,
  }) as Promise<HorseTrainingSessionQueryDto>;

describe('HorseTrainingSessionQueryDto status', () => {
  it('wraps a single status into a list', async () => {
    await expect(parse({ status: 'CANCELLED' })).resolves.toMatchObject({
      status: [SessionParticipantStatus.CANCELLED],
    });
  });

  it('keeps a repeated status as a list', async () => {
    await expect(
      parse({ status: ['CANCELLED', 'CANCELLED_BY_LOCK'] }),
    ).resolves.toMatchObject({
      status: [
        SessionParticipantStatus.CANCELLED,
        SessionParticipantStatus.CANCELLED_BY_LOCK,
      ],
    });
  });

  it('leaves status empty when not sent', async () => {
    const query = await parse({});

    expect(query.status).toBeUndefined();
  });

  it.each([['DONE'], [['CANCELLED', 'DONE']]])(
    'rejects an unknown status %p with 400',
    async (status) => {
      await expect(parse({ status })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});

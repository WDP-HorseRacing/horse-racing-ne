import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/utils/field-errors';
import {
  CreateHorseEnrollmentDto,
  LeaveHorseEnrollmentDto,
} from './horse-enrollment.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});

const leave = (body: object) =>
  pipe.transform(body, { type: 'body', metatype: LeaveHorseEnrollmentDto });

describe('LeaveHorseEnrollmentDto', () => {
  it('rejects a leftAt sent by the client with 400', async () => {
    const rejected: unknown = await leave({
      leftAt: '2026-10-01T08:00:00+07:00',
      reason: 'Nghỉ tập',
    }).catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(BadRequestException);
    expect(
      (rejected as BadRequestException).getResponse() as { message: string[] },
    ).toMatchObject({ message: ['Không nhận ô leftAt'] });
  });

  it('accepts a body with only a reason or nothing', async () => {
    await expect(leave({ reason: 'Nghỉ tập' })).resolves.toEqual({
      reason: 'Nghỉ tập',
    });
    await expect(leave({})).resolves.toEqual({});
  });
});

describe('CreateHorseEnrollmentDto', () => {
  const horseId = '7f1c1d0e-3f4a-4b57-9f0c-2f6f8b9b6a11';
  const enroll = (body: object) =>
    pipe.transform(body, { type: 'body', metatype: CreateHorseEnrollmentDto });

  it('rejects an enrolledAt sent by the client with 400', async () => {
    const rejected: unknown = await enroll({
      horseId,
      enrolledAt: '2026-10-01T08:00:00+07:00',
    }).catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(BadRequestException);
    expect(
      (rejected as BadRequestException).getResponse() as { message: string[] },
    ).toMatchObject({ message: ['Không nhận ô enrolledAt'] });
  });

  it('accepts a body with only the horse', async () => {
    await expect(enroll({ horseId })).resolves.toEqual({ horseId });
  });
});

import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { fieldBadRequest } from '../utils/field-errors';
import { HttpExceptionFilter } from './http-exception.filter';

function bodyFor(exception: unknown): Record<string, unknown> {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const response = { status: jest.fn().mockReturnValue({ json }) };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ correlationId: 'corr-1' }),
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return json.mock.calls[0][0];
}

describe('HttpExceptionFilter', () => {
  it('adds the field errors to a 400 thrown with errors', () => {
    const body = bodyFor(fieldBadRequest('dateOfBirth', 'Ngày sinh sai'));
    expect(body).toMatchObject({
      code: 400,
      message: 'Ngày sinh sai',
      details: null,
      errors: [{ field: 'dateOfBirth', message: 'Ngày sinh sai' }],
    });
  });

  it('keeps the validation messages in details and lists errors', () => {
    const body = bodyFor(
      new BadRequestException({
        message: ['name must be a string'],
        errors: [{ field: 'name', message: 'name must be a string' }],
      }),
    );
    expect(body).toMatchObject({
      message: 'Validation failed',
      details: ['name must be a string'],
      errors: [{ field: 'name', message: 'name must be a string' }],
    });
  });

  it('returns empty errors for a 400 without field errors', () => {
    expect(bodyFor(new BadRequestException('Sai')).errors).toEqual([]);
  });

  it('leaves other status codes without errors', () => {
    const body = bodyFor(new ConflictException('Trùng'));
    expect(body).not.toHaveProperty('errors');
    expect(body).toMatchObject({ code: 409, message: 'Trùng', details: null });
  });

  it('maps a body-parser size error to 413', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });
    expect(bodyFor(tooLarge)).toMatchObject({
      code: 413,
      message: 'Dữ liệu gửi lên vượt quá dung lượng cho phép',
    });
  });

  it('keeps the status of other body-parser client errors', () => {
    const unsupported = Object.assign(new Error('unsupported charset'), {
      status: 415,
      statusCode: 415,
      expose: true,
      type: 'charset.unsupported',
    });
    expect(bodyFor(unsupported)).toMatchObject({
      code: 415,
      message: 'Dữ liệu gửi lên không hợp lệ',
    });
  });

  it('keeps unknown errors as 500', () => {
    expect(bodyFor(new Error('boom'))).toMatchObject({
      code: 500,
      message: 'Internal server error',
    });
  });
});

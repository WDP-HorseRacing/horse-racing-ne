import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(thrown: unknown, host: ArgumentsHost) {
    const exception = fromBodyParserError(thrown);
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const rawMessage =
      typeof body === 'object' && body !== null && 'message' in body
        ? body.message
        : exception instanceof HttpException
          ? exception.message
          : 'Internal server error';
    const message = Array.isArray(rawMessage)
      ? 'Validation failed'
      : String(rawMessage);
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled request error; correlationId=${request.correlationId ?? 'unknown'}`,
      );
    }
    response.status(status).json({
      code: status,
      message,
      details: Array.isArray(rawMessage) ? rawMessage : null,
      ...(exception instanceof BadRequestException && {
        errors:
          typeof body === 'object' && body !== null && 'errors' in body
            ? body.errors
            : [],
      }),
      correlationId: request.correlationId ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Đổi lỗi đọc body của Express (body-parser) thành HttpException tương ứng
 *
 * - Body vượt giới hạn dung lượng: 413
 * - Lỗi 4xx khác của body-parser (vd bảng mã không hỗ trợ): giữ mã lỗi gốc
 * - Lỗi khác giữ nguyên
 *
 * @param error Lỗi bắt được
 * @returns HttpException nếu là lỗi 4xx của body-parser, ngược lại trả lại lỗi ban đầu
 */
function fromBodyParserError(error: unknown): unknown {
  if (error instanceof HttpException || typeof error !== 'object' || !error) {
    return error;
  }
  const { status, expose, type } = error as {
    status?: unknown;
    expose?: unknown;
    type?: unknown;
  };
  if (
    typeof type !== 'string' ||
    expose !== true ||
    typeof status !== 'number' ||
    status < 400 ||
    status >= 500
  ) {
    return error;
  }
  return status === Number(HttpStatus.PAYLOAD_TOO_LARGE)
    ? new PayloadTooLargeException(
        'Dữ liệu gửi lên vượt quá dung lượng cho phép',
      )
    : new HttpException('Dữ liệu gửi lên không hợp lệ', status);
}

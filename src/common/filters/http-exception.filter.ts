import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
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
      correlationId: request.correlationId ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}

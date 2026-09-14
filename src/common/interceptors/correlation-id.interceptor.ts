import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const incoming = request.header('x-correlation-id');
    const correlationId =
      incoming && incoming.length <= 128 ? incoming : randomUUID();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    return next.handle();
  }
}

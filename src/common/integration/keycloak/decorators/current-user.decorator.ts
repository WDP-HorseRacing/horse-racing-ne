import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from '../../../auth/actor';

/**
 * Lay Actor cua request. Luon co tren route duoc bao ve,
 * undefined tren route @Public().
 *
 * Tra ve claim da verify, KHONG phai row database.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor | undefined =>
    context.switchToHttp().getRequest<Request>().actor,
);

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { ACCESS_KEY, IS_PUBLIC_KEY } from '../constants/auth.constants';
import { UserRole } from '../enums/role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { KeycloakService } from '../infrastructure/keycloak/keycloak.service';
import type { KeycloakVerifiedToken } from '../infrastructure/keycloak/types/claims';
import type { Actor } from '../types/actor';

interface ActorRow {
  id: string;
  club_id: string | null;
  role: UserRole | null;
  status: UserStatus;
}

@Injectable()
export class KeycloakGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloak: KeycloakService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer \S+$/i.test(header)) {
      throw new UnauthorizedException('Can bearer token');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const token: KeycloakVerifiedToken = await this.keycloak.verifyToken(
      header.slice(7),
    );

    const rows: ActorRow[] = await this.dataSource.query(
      `SELECT id, club_id, role, status FROM users WHERE keycloak_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [token.sub],
    );
    const user = rows[0];
    if (!user) {
      throw new ForbiddenException('Tài khoản không tồn tại');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản không ở trạng thái hoạt động');
    }
    if (!user.club_id || !user.role) {
      throw new ForbiddenException(
        'Tài khoản chưa được gán câu lạc bộ hoặc vai trò',
      );
    }

    const required =
      this.reflector.getAllAndOverride<UserRole[]>(ACCESS_KEY, targets) ?? [];
    if (required.length && !required.includes(user.role)) {
      throw new ForbiddenException('Không đủ quyền cho thao tác này');
    }

    const actor: Actor = {
      sub: token.sub,
      userId: user.id,
      clubId: user.club_id,
      email: token.email,
      name: token.name,
      roles: [user.role],
    };
    request.actor = actor;
    return true;
  }
}

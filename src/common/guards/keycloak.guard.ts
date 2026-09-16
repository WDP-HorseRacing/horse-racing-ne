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
import {
  ACCESS_KEY,
  IS_PUBLIC_KEY,
  REGISTRATION_KEY,
} from '../constants/auth.constants';
import { UserRole } from '../enums/role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { KeycloakService } from '../infrastructure/keycloak/keycloak.service';
import type { KeycloakVerifiedToken } from '../infrastructure/keycloak/types/claims';
import type { Actor } from '../types/actor';

@Injectable()
export class KeycloakGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloak: KeycloakService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    // [handler, class]: metadata tren method thang metadata tren controller,
    // nen @Public() tren mot method trong controller duoc bao ve van chay.
    const targets = [context.getHandler(), context.getClass()];

    // 1. @Public() -> cho qua, khong can token.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer \S+$/i.test(header)) {
      // 401: "ban la ai?" - chua chung minh duoc danh tinh.
      throw new UnauthorizedException('Can bearer token');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const token: KeycloakVerifiedToken = await this.keycloak.verifyToken(
      header.slice(7),
    );
    const actor: Actor = {
      sub: token.sub,
      email: token.email,
      name: token.name,
      roles: token.roles,
    };

    // 2. RBAC qua @Access([...]), so voi role trong token da verify.
    const required =
      this.reflector.getAllAndOverride<UserRole[]>(ACCESS_KEY, targets) ?? [];
    if (required.length && !required.some((r) => actor.roles.includes(r))) {
      // 403: "toi biet ban la ai, va khong".
      throw new ForbiddenException('Khong du quyen cho thao tac nay');
    }

    // 3. Trừ route @Registration(), moi request phai co row users dang hoat dong.
    // Ket qua co y KHONG gan vao request: guard chi chan, con service nao can
    // du lieu nghiep vu thi tu goi currentUser(manager, actor).
    if (!this.reflector.getAllAndOverride<boolean>(REGISTRATION_KEY, targets)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const rows = await this.dataSource.query(
        `SELECT status FROM users WHERE keycloak_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [actor.sub],
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!rows || rows.length === 0) {
        throw new ForbiddenException('Tài khoản không tồn tại');
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (rows[0].status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('Tài khoản không ở trạng thái hoạt động');
      }
    }

    request.actor = actor;
    return true;
  }
}

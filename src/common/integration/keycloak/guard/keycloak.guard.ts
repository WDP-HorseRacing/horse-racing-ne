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
import { currentUser } from '../../../auth/access';
import type { Actor } from '../../../auth/actor';
import { UserRole } from '../../../../modules/users/user.enums';
import {
  ACCESS_KEY,
  IS_PUBLIC_KEY,
  REGISTRATION_KEY,
} from '../keycloak.constants';
import { KeycloakService } from '../keycloak.service';

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

    const token = await this.keycloak.verifyToken(header.slice(7));
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
      await currentUser(this.dataSource.manager, actor);
    }

    request.actor = actor;
    return true;
  }
}

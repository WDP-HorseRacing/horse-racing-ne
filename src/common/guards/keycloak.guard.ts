import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ACCESS_KEY, IS_PUBLIC_KEY } from '../constants/auth.constants';
import { UserRole } from '../enums/role.enum';
import { KeycloakService } from '../infrastructure/keycloak/keycloak.service';
import type { KeycloakVerifiedToken } from '../infrastructure/keycloak/types/claims';
import type { Actor } from '../types/actor';

@Injectable()
export class KeycloakGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloak: KeycloakService,
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
      throw new UnauthorizedException('Cần có bearer token');
    }

    const token: KeycloakVerifiedToken = await this.keycloak.verifyToken(
      header.slice(7),
    );

    const roles = token.roles.filter((role): role is UserRole =>
      Object.values(UserRole).includes(role as UserRole),
    );

    const required =
      this.reflector.getAllAndOverride<UserRole[]>(ACCESS_KEY, targets) ?? [];
    if (required.length && !required.some((role) => roles.includes(role))) {
      throw new ForbiddenException('Không đủ quyền cho thao tác này');
    }

    const actor: Actor = {
      sub: token.sub,
      email: token.email,
      name: token.name,
      roles,
    };
    request.actor = actor;
    return true;
  }
}

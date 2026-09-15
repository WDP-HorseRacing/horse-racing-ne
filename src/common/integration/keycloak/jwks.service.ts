import { Injectable } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';
import type { KeycloakIntrospectResponse } from './types/token';

@Injectable()
export class KeycloakJwksService {
  constructor(private readonly keycloak: KeycloakService) {}

  async verifyAccessToken(token: string): Promise<KeycloakIntrospectResponse> {
    try {
      const claims = await this.keycloak.verifyToken(token);
      return {
        ...claims,
        active: true,
        username: claims.preferred_username,
        token_type: claims.typ,
      };
    } catch {
      return { active: false };
    }
  }
}

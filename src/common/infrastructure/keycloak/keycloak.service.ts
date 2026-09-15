import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { KeycloakConfig } from './keycloak.config';
import type {
  KeycloakAccessTokenClaims,
  KeycloakVerifiedToken,
} from './types/claims';

@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);
  private readonly jwks: jwksClient.JwksClient;

  constructor(private readonly keycloakConfig: KeycloakConfig) {
    this.jwks = jwksClient({
      jwksUri: this.keycloakConfig.jwksUri,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    this.logger.log(
      `JWKS client san sang cho realm ${this.keycloakConfig.realm}`,
    );
  }

  /**
   * Verify access token Keycloak.
   */
  verifyToken(token: string): Promise<KeycloakVerifiedToken> {
    const audience = this.keycloakConfig.clientId;
    const issuer = this.keycloakConfig.issuer;

    return new Promise((resolve, reject) => {
      // get public key tu JWKS cua Keycloak, theo `kid` trong header cua token.
      const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
        const keyId: unknown = header.kid;
        if (typeof keyId !== 'string' || !keyId) {
          callback(new Error('Token header thieu kid'));
          return;
        }
        this.jwks.getSigningKey(keyId, (error, key) => {
          if (error || !key) {
            callback(
              error instanceof Error
                ? error
                : new Error('Khong tim thay signing key'),
            );
            return;
          }
          callback(null, key.getPublicKey());
        });
      };

      jwt.verify(
        token,
        getKey,
        {
          algorithms: ['RS256'],
          issuer, // Token nay duoc cap boi Keycloak cua hệ thống.
          audience, // Token nay duoc cap CHO TA.
          clockTolerance: 5, // Cho phep sai so 5 giay giua server va Keycloak.
        },
        (error, decoded) => {
          if (error || !decoded || typeof decoded === 'string') {
            this.logger.warn(
              `Verify token that bai: ${
                error instanceof Error ? error.message : 'token khong hop le'
              }`,
            );
            reject(
              new UnauthorizedException('Token khong hop le hoac da het han'),
            );
            return;
          }

          const claims = decoded as unknown as KeycloakAccessTokenClaims;
          if (!claims.sub || !claims.exp || claims.typ !== 'Bearer') {
            reject(
              new UnauthorizedException('Can access token Keycloak con han'),
            );
            return;
          }

          resolve({
            ...claims,
            roles: [
              ...new Set([
                ...(claims.realm_access?.roles ?? []),
                ...(claims.resource_access?.[audience]?.roles ?? []),
              ]),
            ],
          });
        },
      );
    });
  }
}

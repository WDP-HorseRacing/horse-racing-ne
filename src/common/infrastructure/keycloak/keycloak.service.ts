import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type {
  KeycloakAccessTokenClaims,
  KeycloakVerifiedToken,
} from './types/claims';

interface AuthConfig {
  keycloakAuthServerUrl?: string;
  keycloakRealm?: string;
  keycloakClientId?: string;
}

@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);
  private readonly authServerUrl?: string;
  private readonly realm?: string;
  private readonly audience?: string;
  private readonly jwksClientInstance?: jwksClient.JwksClient;

  constructor(private readonly configService: ConfigService) {
    const auth = this.configService.get<AuthConfig>('auth');
    this.authServerUrl =
      auth?.keycloakAuthServerUrl ??
      this.configService.get<string>('KEYCLOAK_AUTH_SERVER_URL');
    this.realm =
      auth?.keycloakRealm ?? this.configService.get<string>('KEYCLOAK_REALM');
    this.audience =
      auth?.keycloakClientId ??
      this.configService.get<string>('KEYCLOAK_CLIENT_ID');

    if (this.authServerUrl && this.realm) {
      const jwksUri = `${this.authServerUrl}/realms/${this.realm}/protocol/openid-connect/certs`;
      this.jwksClientInstance = jwksClient({
        jwksUri,
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      });
      this.logger.log(
        `Initialized Keycloak JWKS client for realm: ${this.realm}`,
      );
    }
  }

  /**
   * Xác thực access token từ Keycloak
   */
  verifyToken(token: string): Promise<KeycloakVerifiedToken> {
    // Fail closed: never trust jwt.decode() as authentication.
    if (!this.jwksClientInstance || !this.audience)
      throw new UnauthorizedException('Keycloak is not configured');

    const jwksClientInstance = this.jwksClientInstance;
    const audience = this.audience;
    const issuer = `${this.authServerUrl}/realms/${this.realm}`;

    return new Promise((resolve, reject) => {
      const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
        const keyId: unknown = header.kid;
        if (typeof keyId !== 'string' || !keyId) {
          return callback(new Error('Token header missing kid'));
        }
        jwksClientInstance.getSigningKey(keyId, (err, key) => {
          if (err || !key) {
            return callback(
              err instanceof Error ? err : new Error('Signing key not found'),
            );
          }
          const signingKey = key.getPublicKey();
          callback(null, signingKey);
        });
      };

      jwt.verify(
        token,
        getKey,
        {
          algorithms: ['RS256'],
          issuer,
          audience,
        },
        (err, decoded) => {
          // err exist or token expired
          if (err || !decoded || typeof decoded === 'string') {
            this.logger.warn(
              `Keycloak token verification failed: ${err instanceof Error ? err.message : 'invalid token'}`,
            );
            return reject(
              new UnauthorizedException('Token verification failed'),
            );
          }

          const claims = decoded as unknown as KeycloakAccessTokenClaims;
          // missing subject, expired token, or type is not Bearer
          if (!claims.sub || !claims.exp || claims.typ !== 'Bearer')
            return reject(
              new UnauthorizedException(
                'A non-expired Keycloak access token is required',
              ),
            );

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

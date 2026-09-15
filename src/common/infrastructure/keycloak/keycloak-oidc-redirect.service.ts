import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  OIDC_STATE_PREFIX,
  OIDC_STATE_TTL_SECONDS,
} from './keycloak.constants';
import { KeycloakConfig } from './keycloak.config';
import {
  KeycloakIdentityProvider,
  type KeycloakPkceBundle,
} from './types/oidc';

@Injectable()
export class KeycloakOidcRedirectService {
  constructor(
    private readonly keycloakConfig: KeycloakConfig,
    private readonly redis: RedisService,
  ) {}

  async buildAuthorizeRedirectUrl(
    provider: KeycloakIdentityProvider,
    redirectUri: string,
  ): Promise<string> {
    const codeVerifier = this.base64Url(randomBytes(32));
    const codeChallenge = this.base64Url(
      createHash('sha256').update(codeVerifier).digest(),
    );
    const state = this.base64Url(randomBytes(32));

    await this.redis.setJson<KeycloakPkceBundle>(
      this.stateKey(state),
      { provider, codeVerifier, redirectUri },
      OIDC_STATE_TTL_SECONDS,
    );

    const url = new URL(
      `${this.keycloakConfig.issuer}/protocol/openid-connect/auth`,
    );
    url.search = new URLSearchParams({
      client_id: this.keycloakConfig.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      kc_idp_hint: provider,
    }).toString();
    return url.toString();
  }

  async consumePkceBundle(
    provider: KeycloakIdentityProvider,
    state: string,
  ): Promise<Omit<KeycloakPkceBundle, 'provider'>> {
    const key = this.stateKey(state);
    const cached = await this.redis.getJson<KeycloakPkceBundle>(key);
    await this.redis.del(key);

    if (!cached || cached.provider !== provider) {
      throw new UnauthorizedException(
        'State OIDC khong hop le hoac da het han',
      );
    }
    return {
      codeVerifier: cached.codeVerifier,
      redirectUri: cached.redirectUri,
    };
  }

  /** Bam state truoc khi lam key: Redis khong luu gia tri state tho. */
  private stateKey(state: string): string {
    const digest = createHash('sha256').update(state).digest('hex');
    return `${OIDC_STATE_PREFIX}:${digest}`;
  }

  private base64Url(value: Buffer): string {
    return value.toString('base64url');
  }
}

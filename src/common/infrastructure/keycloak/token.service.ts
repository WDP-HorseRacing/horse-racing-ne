import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AxiosRequestConfig } from 'axios';
import { KeycloakConfig } from './keycloak.config';
import { KeycloakHttpService } from './keycloak-http.service';
import { KeycloakJwksService } from './jwks.service';
import type {
  KeycloakAuthorizationCodeGrantParams,
  KeycloakIntrospectResponse,
  KeycloakPasswordGrantParams,
  KeycloakRefreshGrantParams,
  KeycloakTokenResponse,
} from './types/token';

@Injectable()
/** Keycloak OpenID Connect client: token, refresh, revoke, introspect. */
export class KeycloakTokenService {
  constructor(
    private readonly keycloakConfig: KeycloakConfig,
    private readonly http: KeycloakHttpService,
    private readonly jwks: KeycloakJwksService,
  ) {}

  exchangeCodeForToken(
    params: KeycloakAuthorizationCodeGrantParams,
  ): Promise<KeycloakTokenResponse> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    });
  }

  async exchangePasswordForToken(
    params: KeycloakPasswordGrantParams,
  ): Promise<KeycloakTokenResponse> {
    try {
      return await this.tokenRequest({
        grant_type: 'password',
        username: params.username,
        password: params.password,
        scope: 'openid profile email',
      });
    } catch (error) {
      if (
        error instanceof BadGatewayException &&
        error.getResponse() === 'Keycloak request failed with status 401'
      ) {
        throw new UnauthorizedException('Invalid username or password');
      }
      throw error;
    }
  }

  exchangeRefreshTokenForToken(
    params: KeycloakRefreshGrantParams,
  ): Promise<KeycloakTokenResponse> {
    return this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
    });
  }

  async revokeRefreshToken(params: KeycloakRefreshGrantParams): Promise<void> {
    await this.formRequest<void>(
      `/realms/${this.keycloakConfig.realmPath}/protocol/openid-connect/revoke`,
      {
        token: params.refreshToken,
        token_type_hint: 'refresh_token',
        ...this.keycloakConfig.clientCredentials(),
      },
    );
  }

  verifyAccessToken(token: string): Promise<KeycloakIntrospectResponse> {
    return this.jwks.verifyAccessToken(token);
  }

  verifyRefreshToken(token: string): Promise<KeycloakIntrospectResponse> {
    return this.introspect(token, 'refresh_token');
  }

  verifyAccessTokenIntrospect(
    token: string,
  ): Promise<KeycloakIntrospectResponse> {
    return this.introspect(token, 'access_token');
  }

  private tokenRequest(
    values: Record<string, string>,
  ): Promise<KeycloakTokenResponse> {
    return this.http.tokenEndpoint({
      ...values,
      ...this.keycloakConfig.clientCredentials(),
    });
  }

  private introspect(
    token: string,
    tokenTypeHint: 'access_token' | 'refresh_token',
  ): Promise<KeycloakIntrospectResponse> {
    return this.formRequest(
      `/realms/${this.keycloakConfig.realmPath}/protocol/openid-connect/token/introspect`,
      {
        token,
        token_type_hint: tokenTypeHint,
        ...this.keycloakConfig.clientCredentials(),
      },
    );
  }

  private formRequest<T>(
    path: string,
    values: Record<string, string>,
  ): Promise<T> {
    return this.jsonRequest(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams(values),
    });
  }

  private async jsonRequest<T>(
    path: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.http.request<T>({
      url: path,
      ...config,
    });
    if (response.status === 204) return undefined as T;
    return response.data;
  }
}

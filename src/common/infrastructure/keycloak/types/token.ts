import type { KeycloakAccessTokenClaims } from './claims';

/** grant_type=password (Direct Access Grant). */
export interface KeycloakPasswordGrantParams {
  username: string;
  password: string;
}

/** grant_type=refresh_token. Cung dung cho lenh logout. */
export interface KeycloakRefreshGrantParams {
  refreshToken: string;
}

/** grant_type=authorization_code (luong redirect trinh duyet, kem PKCE). */
export interface KeycloakAuthorizationCodeGrantParams {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

/** Body tra ve khi doi bat ky grant nao o tren lay token. */
export interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  token_type: string;
  scope?: string;
  session_state?: string;
  id_token?: string;
}

/** Body tra ve tu /token/introspect (RFC 7662). */
export interface KeycloakIntrospectResponse extends Partial<KeycloakAccessTokenClaims> {
  active: boolean;
  client_id?: string;
  username?: string;
  token_type?: string;
}

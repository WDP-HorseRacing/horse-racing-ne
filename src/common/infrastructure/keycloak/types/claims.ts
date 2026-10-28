/** Mot claim chua danh sach role: `realm_access`, hoac `resource_access[clientId]`. */
export interface KeycloakRoleClaim {
  roles?: string[];
}

/**
 * Claim ben trong mot access token Keycloak da giai ma.
 */
export interface KeycloakAccessTokenClaims {
  exp: number;
  iat: number;
  jti: string;
  iss: string;
  aud: string | string[];
  sub: string;
  typ: string; /** 'Bearer' cho access token, 'ID' cho id token, 'Refresh' cho refresh token. */
  azp?: string;
  sid?: string;
  scope?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: KeycloakRoleClaim;
  resource_access?: Record<string, KeycloakRoleClaim>;
  [key: string]: unknown;
}

/**
 * Token da qua verify: chu ky, issuer, audience, han dung deu dat.
 */
export interface KeycloakVerifiedToken extends KeycloakAccessTokenClaims {
  roles: string[];
}

/** Cac identity provider duoc ho tro cho luong broker. */
export enum KeycloakIdentityProvider {
  Google = 'google',
}

/**
 * Bo PKCE luu tam trong Redis giua buoc authorize va buoc callback.
 */
export interface KeycloakPkceBundle {
  provider: KeycloakIdentityProvider;
  codeVerifier: string;
  redirectUri: string;
}

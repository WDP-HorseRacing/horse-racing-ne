/**
 * Chu the cua mot request: doc tu access token DA VERIFY.
 */
export interface Actor {
  /** Claim `sub` - luu o local thanh users.keycloak_id. */
  sub: string;
  email?: string;
  name?: string;
  /** Realm roles hop client roles, da gop va loai trung. Can cu phan quyen. */
  roles: string[];
}

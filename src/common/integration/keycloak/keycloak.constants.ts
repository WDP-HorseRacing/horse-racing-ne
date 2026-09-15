/** Route cho phep goi khong can token. */
export const IS_PUBLIC_KEY = 'racehorse:public';

/** Danh sach role duoc phep, so voi actor.roles lay tu token. */
export const ACCESS_KEY = 'racehorse:roles';

/** Route duoc chay khi token hop le nhung CHUA co row users. */
export const REGISTRATION_KEY = 'racehorse:registration';

/** Tien to key luu PKCE state cua luong redirect. */
export const OIDC_STATE_PREFIX = 'keycloak:oidc-state';

/** State PKCE song 10 phut - du de dang nhap, ngan de khong ton kho. */
export const OIDC_STATE_TTL_SECONDS = 600;

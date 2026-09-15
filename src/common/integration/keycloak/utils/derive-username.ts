export interface DeriveUsernameParams {
  email?: string | null;
  fallback?: string | null;
}

/**
 * Suy ra username mac dinh: lay phan truoc dau "@" cua email.
 * "trainer@racehorse.test" -> "trainer"
 */
export const deriveUsername = ({
  email,
  fallback,
}: DeriveUsernameParams): string => {
  const localPart = email?.includes('@')
    ? email.slice(0, email.indexOf('@'))
    : null;
  return (localPart ?? fallback ?? email ?? '').trim();
};

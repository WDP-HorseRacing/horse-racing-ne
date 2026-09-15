/**
 * Keycloak 24 bat buoc co firstName va lastName (declarative user profile),
 * thieu thi tai khoan bi coi la "not fully set up" va khong dang nhap duoc.
 * App nay chi luu mot o fullName, nen phai cat ra.
 *
 * "Nguyen Van A" -> { firstName: "Nguyen Van", lastName: "A" }
 * "Madonna"      -> { firstName: "Madonna",    lastName: "-" }
 */
export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) {
    return { firstName: parts[0] ?? '-', lastName: '-' };
  }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

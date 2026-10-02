/**
 * Tách họ tên đầy đủ thành firstName và lastName cho Keycloak
 *
 * - Từ cuối là lastName, các từ trước đó là firstName: "Nguyen Van A" -> { firstName: "Nguyen Van", lastName: "A" }
 * - Chỉ có một từ: lastName là "-": "Madonna" -> { firstName: "Madonna", lastName: "-" }
 *
 * @param fullName Họ tên đầy đủ
 * @returns firstName và lastName đã tách
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

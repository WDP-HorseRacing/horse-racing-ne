import { UserRole, UserStatus } from '../user.enums';

/**
 * The user fields needed to evaluate user management rules
 */
export interface ManagedUser {
  id: string;
  role: UserRole | null;
  status: UserStatus;
}

/**
 * A requested change to a user's role or status
 */
export interface UserChange {
  role?: UserRole;
  status?: UserStatus;
}

/**
 * Check whether the actor is changing their own role or status
 * @param actorUserId The ID of the user performing the change
 * @param target The user being changed
 * @param change The requested change
 * @returns The error message if the change is not allowed, or null otherwise
 */
export function getSelfChangeError(
  actorUserId: string,
  target: ManagedUser,
  change: UserChange,
): string | null {
  if (actorUserId !== target.id) return null;
  if (change.role !== undefined && change.role !== target.role) {
    return 'Không thể tự đổi vai trò của chính mình';
  }
  if (change.status !== undefined && change.status !== target.status) {
    return 'Không thể tự đổi trạng thái tài khoản của chính mình';
  }
  return null;
}

/**
 * Check whether a change takes an active club manager out of that role or status
 * @param target The user being changed
 * @param change The requested change
 * @returns True if the user is an active club manager and the change removes the role or deactivates them
 */
export function isRemovingActiveManager(
  target: ManagedUser,
  change: UserChange,
): boolean {
  if (
    target.role !== UserRole.CLUB_MANAGER ||
    target.status !== UserStatus.ACTIVE
  ) {
    return false;
  }
  const losesRole =
    change.role !== undefined && change.role !== UserRole.CLUB_MANAGER;
  const losesStatus =
    change.status !== undefined && change.status !== UserStatus.ACTIVE;
  return losesRole || losesStatus;
}

import { UserRole, UserStatus } from '../user.enums';

export interface ManagedUser {
  id: string;
  role: UserRole | null;
  status: UserStatus;
}

export interface UserChange {
  role?: UserRole;
  status?: UserStatus;
}

export function selfChangeError(
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

export function removesActiveManager(
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

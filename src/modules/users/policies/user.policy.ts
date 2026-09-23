import { BadRequestException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';

/**
 * Các field của user cần để xét luật quản lý tài khoản
 */
export interface ManagedUser {
  id: string;
  role: UserRole | null;
  status: UserStatus;
}

/**
 * Thay đổi được yêu cầu trên vai trò hoặc trạng thái của một user
 */
export interface UserChange {
  role?: UserRole;
  status?: UserStatus;
}

/**
 * Chặn người gọi tự đổi vai trò hoặc trạng thái tài khoản của chính mình
 *
 * - Người gọi khác user bị đổi: luôn cho qua
 * - Giữ nguyên giá trị cũ (gửi lại đúng role/status đang có): không tính là đổi
 *
 * @param actorUserId UUID (users.id) của người đang thực hiện thay đổi
 * @param target User bị thay đổi
 * @param change Vai trò hoặc trạng thái mới được yêu cầu
 * @throws BadRequestException Nếu người gọi tự đổi vai trò hoặc trạng thái của chính mình
 */
export function assertNotSelfChange(
  actorUserId: string,
  target: ManagedUser,
  change: UserChange,
): void {
  if (actorUserId !== target.id) return;
  if (change.role !== undefined && change.role !== target.role) {
    throw new BadRequestException('Không thể tự đổi vai trò của chính mình');
  }
  if (change.status !== undefined && change.status !== target.status) {
    throw new BadRequestException(
      'Không thể tự đổi trạng thái tài khoản của chính mình',
    );
  }
}

/**
 * Kiểm tra thay đổi có làm một Club Manager đang hoạt động mất vai trò hoặc mất trạng thái hoạt động không
 *
 * - Chỉ xét user đang là Club Manager và đang ACTIVE
 * - Mất vai trò: role mới khác CLUB_MANAGER
 * - Mất trạng thái: status mới khác ACTIVE
 *
 * @param target User bị thay đổi
 * @param change Vai trò hoặc trạng thái mới được yêu cầu
 * @returns true nếu thay đổi làm bớt đi một Club Manager đang hoạt động
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

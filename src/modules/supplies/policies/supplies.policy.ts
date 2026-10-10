import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';

const NEXT_REQUEST_STATUSES: Readonly<
  Record<SupplyRequestStatus, readonly SupplyRequestStatus[]>
> = {
  [SupplyRequestStatus.PENDING]: [
    SupplyRequestStatus.APPROVED,
    SupplyRequestStatus.REJECTED,
  ],
  [SupplyRequestStatus.APPROVED]: [SupplyRequestStatus.FULFILLED],
  [SupplyRequestStatus.REJECTED]: [],
  [SupplyRequestStatus.FULFILLED]: [],
};

/**
 * Bắt buộc người gọi được xem đề xuất bổ sung
 *
 * - Club Manager: xem mọi đề xuất
 * - Vai trò khác: chỉ đề xuất của chính mình
 *
 * @param callerId UUID người gọi
 * @param callerRole Vai trò người gọi
 * @param requestedBy UUID người gửi đề xuất
 * @throws ForbiddenException Nếu đề xuất không phải của người gọi và người gọi không phải Club Manager
 */
export function assertCanViewSupplyRequest(
  callerId: string,
  callerRole: UserRole,
  requestedBy: string,
): void {
  if (callerRole !== UserRole.CLUB_MANAGER && requestedBy !== callerId) {
    throw new ForbiddenException('Chỉ xem được đề xuất của chính mình');
  }
}

/**
 * Bắt buộc người gọi là người gửi và đề xuất còn chờ duyệt
 *
 * @param callerId UUID người gọi
 * @param requestedBy UUID người gửi đề xuất
 * @param status Trạng thái hiện tại của đề xuất
 * @throws ForbiddenException Nếu người gọi không phải người gửi
 * @throws ConflictException Nếu đề xuất không còn PENDING
 */
export function assertSupplyRequestEditable(
  callerId: string,
  requestedBy: string,
  status: SupplyRequestStatus,
): void {
  if (requestedBy !== callerId) {
    throw new ForbiddenException('Chỉ người gửi mới sửa được đề xuất');
  }
  if (status !== SupplyRequestStatus.PENDING) {
    throw new ConflictException('Chỉ sửa được đề xuất đang chờ duyệt');
  }
}

/**
 * Bắt buộc đề xuất chuyển trạng thái đúng thứ tự
 *
 * - PENDING → APPROVED hoặc REJECTED
 * - APPROVED → FULFILLED
 *
 * @param current Trạng thái hiện tại
 * @param next Trạng thái muốn chuyển sang
 * @throws ConflictException Nếu không được chuyển từ current sang next
 */
export function assertSupplyRequestTransition(
  current: SupplyRequestStatus,
  next: SupplyRequestStatus,
): void {
  if (!NEXT_REQUEST_STATUSES[current].includes(next)) {
    throw new ConflictException(
      `Không thể chuyển đề xuất từ ${current} sang ${next}`,
    );
  }
}

/**
 * Bắt buộc có lý do khi từ chối đề xuất
 *
 * @param next Trạng thái muốn chuyển sang
 * @param reason Lý do đã bỏ khoảng trắng, null nếu rỗng
 * @throws BadRequestException Nếu từ chối mà không có lý do
 */
export function assertRejectionReason(
  next: SupplyRequestStatus,
  reason: string | null,
): void {
  if (next === SupplyRequestStatus.REJECTED && !reason) {
    throw new BadRequestException('Từ chối phải có lý do');
  }
}

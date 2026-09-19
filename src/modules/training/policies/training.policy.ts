import { BadRequestException, ConflictException } from '@nestjs/common';
import { TrainingPlanStatus } from '../constants/training-plan-status.enum';
import { TrainingSessionStatus } from '../constants/training-session-status.enum';

/**
 * Trích xuất phần ngày (YYYY-MM-DD) từ một chuỗi ngày tháng hoặc ISO Date String.
 *
 * @param value Chuỗi ngày (ví dụ: '2026-09-16' hoặc '2026-09-16T15:30:00.000Z')
 * @returns string Chuỗi ngày định dạng YYYY-MM-DD (10 ký tự đầu)
 */
export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

/**
 * Kiểm tra tính hợp lệ của thời gian kế hoạch huấn luyện.
 * Đảm bảo ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.
 *
 * @param start Ngày bắt đầu (startDate)
 * @param end Ngày kết thúc (endDate)
 * @throws BadRequestException Nếu startDate > endDate
 */
export function assertValidPlanDates(start: string, end: string): void {
  if (dateOnly(start) > dateOnly(end)) {
    throw new BadRequestException('startDate phải nhỏ hơn hoặc bằng endDate');
  }
}

/**
 * Kiểm tra ngày lên lịch của một buổi tập có nằm trong khung thời gian của giáo án hay không.
 *
 * @param scheduledAt Thời gian dự kiến diễn ra buổi tập
 * @param startDate Ngày bắt đầu của giáo án
 * @param endDate Ngày kết thúc của giáo án
 * @throws BadRequestException Nếu ngày của buổi tập nằm trước startDate hoặc sau endDate
 */
export function assertSessionDateInPlan(
  scheduledAt: string,
  startDate: string,
  endDate: string,
): void {
  const day = dateOnly(scheduledAt);
  if (day < startDate || day > endDate) {
    throw new BadRequestException('Buổi tập phải nằm trong thời gian giáo án');
  }
}

/**
 * Kiểm tra con ngựa được phép lập giáo án.
 * Ngựa tham chiếu chỉ dùng cho phả hệ, không thuộc đàn nên không lập giáo án được.
 *
 * @param isReference true nếu là ngựa tham chiếu
 * @throws BadRequestException Nếu là ngựa tham chiếu
 */
export function assertTrainableHorse(isReference: boolean): void {
  if (isReference) {
    throw new BadRequestException(
      'Ngựa tham chiếu không thuộc đàn, không lập giáo án được',
    );
  }
}

/**
 * Kiểm tra điều kiện trạng thái để được phép chỉnh sửa kế hoạch huấn luyện.
 * Chỉ cho phép cập nhật khi giáo án chưa bắt đầu (vẫn đang SCHEDULED).
 *
 * @param status Trạng thái hiện tại của giáo án
 * @throws ConflictException Nếu giáo án không ở trạng thái SCHEDULED
 */
export function assertPlanEditable(status: TrainingPlanStatus): void {
  if (status !== TrainingPlanStatus.SCHEDULED) {
    throw new ConflictException('Chỉ được sửa giáo án đang SCHEDULED');
  }
}

/**
 * Kiểm tra điều kiện trạng thái để kích hoạt kế hoạch huấn luyện sang ACTIVE.
 * Chỉ giáo án ở trạng thái SCHEDULED mới được phép kích hoạt.
 *
 * @param status Trạng thái hiện tại của giáo án
 * @throws ConflictException Nếu giáo án không ở trạng thái SCHEDULED
 */
export function assertPlanActivatable(status: TrainingPlanStatus): void {
  if (status !== TrainingPlanStatus.SCHEDULED) {
    throw new ConflictException('Chỉ giáo án SCHEDULED mới được kích hoạt');
  }
}

/**
 * Kiểm tra điều kiện trạng thái để hoàn thành kế hoạch huấn luyện.
 * Chỉ giáo án đang hoạt động (ACTIVE) mới được phép đánh dấu hoàn thành.
 *
 * @param status Trạng thái hiện tại của giáo án
 * @throws ConflictException Nếu giáo án không ở trạng thái ACTIVE
 */
export function assertPlanCompletable(status: TrainingPlanStatus): void {
  if (status !== TrainingPlanStatus.ACTIVE) {
    throw new ConflictException('Chỉ giáo án ACTIVE mới được hoàn thành');
  }
}

/**
 * Kiểm tra điều kiện trạng thái để hủy kế hoạch huấn luyện.
 * Không cho phép hủy một giáo án đã kết thúc (đã hoàn thành hoặc đã bị hủy trước đó).
 *
 * @param status Trạng thái hiện tại của giáo án
 * @throws ConflictException Nếu giáo án đã là COMPLETED hoặc CANCELLED
 */
export function assertPlanCancellable(status: TrainingPlanStatus): void {
  if (
    status === TrainingPlanStatus.COMPLETED ||
    status === TrainingPlanStatus.CANCELLED
  ) {
    throw new ConflictException('Giáo án đã ở trạng thái kết thúc');
  }
}

/**
 * Kiểm tra điều kiện trạng thái để được phép chỉnh sửa buổi tập.
 * Chỉ cho phép sửa khi buổi tập chưa diễn ra (vẫn đang SCHEDULED).
 *
 * @param status Trạng thái hiện tại của buổi tập
 * @throws ConflictException Nếu buổi tập không ở trạng thái SCHEDULED
 */
export function assertSessionEditable(status: TrainingSessionStatus): void {
  if (status !== TrainingSessionStatus.SCHEDULED) {
    throw new ConflictException('Chỉ được sửa buổi tập đang SCHEDULED');
  }
}

/**
 * Kiểm tra điều kiện trạng thái để bắt đầu buổi tập (chuyển sang IN_PROGRESS).
 * Chỉ buổi tập đang SCHEDULED mới được bắt đầu.
 *
 * @param status Trạng thái hiện tại của buổi tập
 * @throws ConflictException Nếu buổi tập không ở trạng thái SCHEDULED
 */
export function assertSessionAbleToStart(status: TrainingSessionStatus): void {
  if (status !== TrainingSessionStatus.SCHEDULED) {
    throw new ConflictException('Chỉ buổi tập SCHEDULED mới được bắt đầu');
  }
}

/**
 * Kiểm tra điều kiện trạng thái để hoàn thành buổi tập.
 * Buổi tập bắt buộc phải đang diễn ra (IN_PROGRESS) mới được phép hoàn thành và ghi nhận kết quả.
 *
 * @param status Trạng thái hiện tại của buổi tập
 * @throws ConflictException Nếu buổi tập không ở trạng thái IN_PROGRESS
 */
export function assertSessionCompletable(status: TrainingSessionStatus): void {
  if (status !== TrainingSessionStatus.IN_PROGRESS) {
    throw new ConflictException('Chỉ buổi tập IN_PROGRESS mới được hoàn thành');
  }
}

/**
 * Kiểm tra điều kiện trạng thái để hủy buổi tập.
 * Không cho phép hủy một buổi tập đã kết thúc (đã hoàn thành hoặc đã bị hủy).
 *
 * @param status Trạng thái hiện tại của buổi tập
 * @throws ConflictException Nếu buổi tập đã là COMPLETED hoặc CANCELLED
 */
export function assertSessionCancellable(status: TrainingSessionStatus): void {
  if (
    status === TrainingSessionStatus.COMPLETED ||
    status === TrainingSessionStatus.CANCELLED
  ) {
    throw new ConflictException('Buổi tập đã ở trạng thái kết thúc');
  }
}

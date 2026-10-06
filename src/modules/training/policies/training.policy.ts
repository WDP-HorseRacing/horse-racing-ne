import { BadRequestException, ConflictException } from '@nestjs/common';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { isReadOnlyLifecycle } from '../../horses/policies/horse.policy';
import type {
  ReadOnlyLifecycleStatus,
  EligibilityResult,
} from '../../horses/types/horse.types';

/**
 * Câu báo 409 khi ghi danh vào lớp ngựa có hồ sơ chỉ được xem, theo trạng thái
 */
const READ_ONLY_ENROLL_MESSAGES: Record<ReadOnlyLifecycleStatus, string> = {
  [HorseLifecycleStatus.TRANSFERRED]: 'Ngựa đã chuyển nhượng, không học lớp',
  [HorseLifecycleStatus.DECEASED]: 'Ngựa đã mất, không học lớp',
};
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';

export function assertClassActivatable(status: TrainingClassStatus): void {
  if (status !== TrainingClassStatus.DRAFT) {
    throw new ConflictException('Chỉ class DRAFT mới được kích hoạt');
  }
}

export function assertClassCompletable(status: TrainingClassStatus): void {
  if (status !== TrainingClassStatus.ACTIVE) {
    throw new ConflictException('Chỉ class ACTIVE mới được hoàn thành');
  }
}

export function assertClassCancellable(status: TrainingClassStatus): void {
  if (
    status === TrainingClassStatus.COMPLETED ||
    status === TrainingClassStatus.CANCELLED
  ) {
    throw new ConflictException('Class đã ở trạng thái kết thúc');
  }
}

export function assertClassEditable(status: TrainingClassStatus): void {
  if (
    status === TrainingClassStatus.COMPLETED ||
    status === TrainingClassStatus.CANCELLED
  ) {
    throw new ConflictException('Class đã ở trạng thái kết thúc');
  }
}

export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function assertValidDateRange(start: string, end: string): void {
  if (dateOnly(start) > dateOnly(end)) {
    throw new BadRequestException('startDate phải nhỏ hơn hoặc bằng endDate');
  }
}

export function assertSessionWindowInPlan(
  scheduledStartAt: string | Date,
  scheduledEndAt: string | Date,
  startDate: string,
  endDate: string,
): void {
  const start = new Date(scheduledStartAt).getTime();
  const end = new Date(scheduledEndAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new BadRequestException(
      'scheduledEndAt phải lớn hơn scheduledStartAt',
    );
  }
  const startDay = dateOnly(new Date(start).toISOString());
  const endDay = dateOnly(new Date(end).toISOString());
  if (startDay < dateOnly(startDate) || endDay > dateOnly(endDate)) {
    throw new BadRequestException('Buổi tập phải nằm trong thời gian giáo án');
  }
}

export function assertTrainableHorse(isReference: boolean): void {
  if (isReference) {
    throw new BadRequestException(
      'Ngựa tham chiếu không thuộc đàn, không lập giáo án được',
    );
  }
}

export function assertPlanEditable(status: TrainingPlanStatus): void {
  if (status !== TrainingPlanStatus.SCHEDULED) {
    throw new ConflictException('Chỉ được sửa giáo án đang SCHEDULED');
  }
}

export function assertPlanActivatable(status: TrainingPlanStatus): void {
  if (status !== TrainingPlanStatus.SCHEDULED) {
    throw new ConflictException('Chỉ giáo án SCHEDULED mới được kích hoạt');
  }
}

export function assertPlanCompletable(status: TrainingPlanStatus): void {
  if (status !== TrainingPlanStatus.ACTIVE) {
    throw new ConflictException('Chỉ giáo án ACTIVE mới được hoàn thành');
  }
}

export function assertPlanCancellable(status: TrainingPlanStatus): void {
  if (
    status === TrainingPlanStatus.COMPLETED ||
    status === TrainingPlanStatus.CANCELLED
  ) {
    throw new ConflictException('Giáo án đã ở trạng thái kết thúc');
  }
}

export function assertSessionEditable(status: TrainingSessionStatus): void {
  if (status !== TrainingSessionStatus.DRAFT) {
    throw new ConflictException('Chỉ được sửa buổi tập đang DRAFT');
  }
}

export function assertSessionPublishable(status: TrainingSessionStatus): void {
  if (status !== TrainingSessionStatus.DRAFT) {
    throw new ConflictException('Chỉ buổi tập DRAFT mới được publish');
  }
}

export function assertSessionCancellable(status: TrainingSessionStatus): void {
  if (
    status === TrainingSessionStatus.COMPLETED ||
    status === TrainingSessionStatus.CANCELLED
  ) {
    throw new ConflictException('Buổi tập đã ở trạng thái kết thúc');
  }
}

export function assertSessionOperational(status: TrainingSessionStatus): void {
  if (
    status !== TrainingSessionStatus.SCHEDULED &&
    status !== TrainingSessionStatus.IN_PROGRESS
  ) {
    throw new ConflictException('Session không ở trạng thái thực thi');
  }
}

export function assertParticipantCheckIn(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.PLANNED) {
    throw new ConflictException('Chỉ participant PLANNED mới được check-in');
  }
}

export function assertParticipantAbsent(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.PLANNED) {
    throw new ConflictException(
      'Chỉ participant PLANNED mới được đánh dấu vắng',
    );
  }
}

export function assertParticipantReady(status: SessionParticipantStatus): void {
  if (status !== SessionParticipantStatus.PRESENT) {
    throw new ConflictException('Participant phải PRESENT trước khi READY');
  }
}

export function assertParticipantStart(status: SessionParticipantStatus): void {
  if (status !== SessionParticipantStatus.READY) {
    throw new ConflictException('Participant phải READY trước khi bắt đầu');
  }
}

export function assertParticipantComplete(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.ONGOING) {
    throw new ConflictException(
      'Participant phải ONGOING trước khi hoàn thành',
    );
  }
}

/**
 * Chọn trạng thái ban đầu và lý do không đủ điều kiện cho một lượt tập mới tạo.
 *
 * - Được tập: PLANNED, lý do null
 * - Đang bị khóa huấn luyện: CANCELLED_BY_LOCK; không được tập vì lý do khác: INELIGIBLE
 * - Lý do là trainingReasons nối bằng dấu phẩy, tối đa 64 ký tự
 *
 * @param eligibility Kết quả evaluateEligibility của con ngựa
 * @param hasActiveTrainingLock true nếu ngựa đang có lệnh khóa huấn luyện ACTIVE
 * @returns Trạng thái và lý do để gán vào lượt tập
 */
export function initialParticipantEligibility(
  eligibility: EligibilityResult,
  hasActiveTrainingLock: boolean,
): {
  status: SessionParticipantStatus;
  ineligibilityReason: string | null;
} {
  if (eligibility.trainingEligible) {
    return {
      status: SessionParticipantStatus.PLANNED,
      ineligibilityReason: null,
    };
  }
  return {
    status: hasActiveTrainingLock
      ? SessionParticipantStatus.CANCELLED_BY_LOCK
      : SessionParticipantStatus.INELIGIBLE,
    ineligibilityReason:
      eligibility.trainingReasons.join(',').slice(0, 64) || null,
  };
}

/**
 * Chặn ghi danh ngựa không ở trạng thái ACTIVE vào lớp.
 *
 * @param lifecycleStatus Trạng thái vòng đời hiện tại của ngựa
 * @throws ConflictException Nếu ngựa không ở trạng thái ACTIVE
 */
export function assertHorseEnrollable(
  lifecycleStatus: HorseLifecycleStatus,
): void {
  if (lifecycleStatus === HorseLifecycleStatus.RETIRED) {
    throw new ConflictException('Ngựa đã giải nghệ, không học lớp');
  }
  if (isReadOnlyLifecycle(lifecycleStatus)) {
    throw new ConflictException(READ_ONLY_ENROLL_MESSAGES[lifecycleStatus]);
  }
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import { toClubDate, toDisplayDate } from '../../../common/utils/club-date';
import { EligibilityReason } from '../../horses/enums/eligibility-reason.enum';
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
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import type {
  HorseSessionHolding,
  SessionWindow,
} from '../types/training-session.types';

export function assertClassActivatable(status: TrainingClassStatus): void {
  if (status !== TrainingClassStatus.DRAFT) {
    throw new ConflictException('Chỉ lớp nháp mới được kích hoạt');
  }
}

export function assertClassCompletable(status: TrainingClassStatus): void {
  if (status !== TrainingClassStatus.ACTIVE) {
    throw new ConflictException('Chỉ lớp đang chạy mới được hoàn thành');
  }
}

export function assertClassCancellable(status: TrainingClassStatus): void {
  if (
    status === TrainingClassStatus.COMPLETED ||
    status === TrainingClassStatus.CANCELLED
  ) {
    throw new ConflictException('Lớp đã kết thúc');
  }
}

export function assertClassEditable(status: TrainingClassStatus): void {
  if (
    status === TrainingClassStatus.COMPLETED ||
    status === TrainingClassStatus.CANCELLED
  ) {
    throw new ConflictException('Lớp đã kết thúc');
  }
}

export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function assertValidDateRange(start: string, end: string): void {
  if (dateOnly(start) > dateOnly(end)) {
    throw new BadRequestException(
      'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    );
  }
}

/**
 * Kiểm giờ buổi tập hợp lệ và nằm trong thời gian của lớp, so theo ngày lịch CLB
 *
 * @param scheduledStartAt Thời điểm bắt đầu buổi
 * @param scheduledEndAt Thời điểm kết thúc buổi
 * @param startDate Ngày bắt đầu lớp dạng YYYY-MM-DD
 * @param endDate Ngày kết thúc lớp dạng YYYY-MM-DD
 * @throws BadRequestException Nếu giờ kết thúc không sau giờ bắt đầu, hoặc ngày buổi tập theo lịch CLB nằm ngoài thời gian lớp
 */
export function assertSessionWindowInClass(
  scheduledStartAt: string | Date,
  scheduledEndAt: string | Date,
  startDate: string,
  endDate: string,
): void {
  const start = new Date(scheduledStartAt).getTime();
  const end = new Date(scheduledEndAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu');
  }
  const startDay = toClubDate(new Date(start));
  const endDay = toClubDate(new Date(end));
  if (startDay < dateOnly(startDate) || endDay > dateOnly(endDate)) {
    throw new BadRequestException('Buổi tập phải nằm trong thời gian của lớp');
  }
}

/**
 * Kiểm hai buổi tập có trùng giờ không
 *
 * - Mỗi buổi tính từ giờ bắt đầu tới trước giờ kết thúc; buổi này kết thúc đúng lúc buổi kia bắt đầu thì không trùng
 *
 * @param a Khoảng giờ của buổi thứ nhất
 * @param b Khoảng giờ của buổi thứ hai
 * @returns true nếu hai buổi trùng giờ
 */
export function sessionWindowsOverlap(
  a: SessionWindow,
  b: SessionWindow,
): boolean {
  return (
    a.scheduledStartAt < b.scheduledEndAt &&
    b.scheduledStartAt < a.scheduledEndAt
  );
}

/**
 * Chặn buổi tập trùng giờ với buổi khác của cùng lớp
 *
 * @param window Khoảng giờ của buổi đang thêm hoặc sửa
 * @param others Các buổi chưa hủy khác của lớp
 * @throws ConflictException Nếu trùng giờ với một buổi; câu báo kèm giờ và ngày bắt đầu của buổi trùng theo giờ CLB
 */
export function assertNoOverlappingClassSession(
  window: SessionWindow,
  others: ReadonlyArray<SessionWindow>,
): void {
  const clash = others.find((other) => sessionWindowsOverlap(window, other));
  if (clash) {
    throw new ConflictException(
      `Trùng giờ với buổi tập lúc ${formatClubDateTime(clash.scheduledStartAt)} của lớp`,
    );
  }
}

/**
 * Tìm buổi ngựa đang giữ chỗ trùng giờ với một buổi tập
 *
 * @param window Khoảng giờ của buổi tập cần xét
 * @param holdings Các buổi ngựa đang giữ chỗ
 * @returns Buổi giữ chỗ trùng giờ đầu tiên, undefined nếu không có
 */
export function findOverlappingHolding(
  window: SessionWindow,
  holdings: ReadonlyArray<HorseSessionHolding>,
): HorseSessionHolding | undefined {
  return holdings.find((holding) => sessionWindowsOverlap(window, holding));
}

/**
 * Chặn ghi danh khi ngựa đã giữ chỗ ở lớp khác trùng giờ với một buổi của lớp đang ghi danh
 *
 * @param horseName Tên ngựa
 * @param sessions Các buổi của lớp sẽ tạo lượt cho ngựa
 * @param holdings Các buổi ngựa đang giữ chỗ ở lớp khác
 * @throws ConflictException Nếu một buổi trùng giờ với buổi ngựa đang giữ chỗ
 */
export function assertNoHoldingOverlap(
  horseName: string,
  sessions: ReadonlyArray<SessionWindow>,
  holdings: ReadonlyArray<HorseSessionHolding>,
): void {
  for (const session of sessions) {
    const clash = findOverlappingHolding(session, holdings);
    if (clash) {
      throw new ConflictException(
        `Ngựa ${horseName} đã có buổi tập trùng giờ ở lớp ${clash.classCode}`,
      );
    }
  }
}

export function assertTrainableHorse(isReference: boolean): void {
  if (isReference) {
    throw new BadRequestException(
      'Ngựa tham chiếu không thuộc đàn, không lập giáo án được',
    );
  }
}

export function assertSessionEditable(status: TrainingSessionStatus): void {
  if (status !== TrainingSessionStatus.DRAFT) {
    throw new ConflictException('Chỉ được sửa buổi tập nháp');
  }
}

export function assertSessionPublishable(status: TrainingSessionStatus): void {
  if (status !== TrainingSessionStatus.DRAFT) {
    throw new ConflictException('Chỉ buổi tập nháp mới được công bố');
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
    throw new ConflictException(
      'Buổi tập chưa công bố hoặc đã kết thúc, không thao tác được',
    );
  }
}

export function assertParticipantCheckIn(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.PLANNED) {
    throw new ConflictException(
      'Chỉ lượt tập chờ điểm danh mới được điểm danh',
    );
  }
}

/**
 * Kiểm lượt tham gia còn báo vắng được
 *
 * - Lượt chờ điểm danh, có mặt hoặc sẵn sàng: được báo vắng
 * - Lượt đang chạy hoặc đã kết thúc: 409
 *
 * @param status Trạng thái hiện tại của lượt tham gia
 * @throws ConflictException Nếu lượt không ở PLANNED, PRESENT hoặc READY
 */
export function assertParticipantAbsent(
  status: SessionParticipantStatus,
): void {
  if (
    status !== SessionParticipantStatus.PLANNED &&
    status !== SessionParticipantStatus.PRESENT &&
    status !== SessionParticipantStatus.READY
  ) {
    throw new ConflictException(
      'Chỉ lượt chờ điểm danh, có mặt hoặc sẵn sàng mới được báo vắng',
    );
  }
}

export function assertParticipantReady(status: SessionParticipantStatus): void {
  if (status !== SessionParticipantStatus.PRESENT) {
    throw new ConflictException(
      'Lượt tập phải có mặt trước khi chuyển sang sẵn sàng',
    );
  }
}

export function assertParticipantStart(status: SessionParticipantStatus): void {
  if (status !== SessionParticipantStatus.READY) {
    throw new ConflictException('Lượt tập phải sẵn sàng trước khi bắt đầu');
  }
}

export function assertParticipantComplete(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.ONGOING) {
    throw new ConflictException('Lượt tập phải đang tập trước khi hoàn thành');
  }
}

/**
 * Áp cường độ buổi tập lên điều kiện tập của con ngựa
 *
 * - Ngựa Cần theo dõi gặp buổi HEAVY: không được tập, thêm lý do HEALTH_UNDER_OBSERVATION
 * - Các trường hợp khác: giữ nguyên kết quả
 *
 * @param eligibility Kết quả evaluateEligibility của con ngựa
 * @param intensity Cường độ của buổi tập
 * @returns Điều kiện tập của con ngựa cho riêng buổi tập này
 */
export function eligibilityForSession(
  eligibility: EligibilityResult,
  intensity: TrainingIntensity,
): EligibilityResult {
  const underObservation = eligibility.reasons.includes(
    EligibilityReason.HEALTH_UNDER_OBSERVATION,
  );
  if (!underObservation || intensity !== TrainingIntensity.HEAVY) {
    return eligibility;
  }
  return {
    ...eligibility,
    trainingEligible: false,
    trainingReasons: [
      ...eligibility.trainingReasons,
      EligibilityReason.HEALTH_UNDER_OBSERVATION,
    ],
  };
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

/**
 * Kiểm nội dung bài tập của môn học theo loại buổi
 *
 * - Môn chạy thử: cự ly phải lớn hơn 0
 * - Môn thường: không có thời gian mục tiêu
 *
 * @param sessionType Loại buổi của môn
 * @param plannedDistanceM Cự ly dự kiến (mét)
 * @param targetTimeMs Thời gian mục tiêu (ms), null nếu không có
 * @throws BadRequestException Nếu môn chạy thử có cự ly 0, hoặc môn thường có thời gian mục tiêu
 */
export function assertSubjectExercise(
  sessionType: TrainingSessionType,
  plannedDistanceM: number,
  targetTimeMs: number | null,
): void {
  if (sessionType === TrainingSessionType.TIME_TRIAL && plannedDistanceM <= 0) {
    throw new BadRequestException('Môn chạy thử phải có cự ly lớn hơn 0');
  }
  if (sessionType === TrainingSessionType.REGULAR && targetTimeMs !== null) {
    throw new BadRequestException('Chỉ môn chạy thử mới có thời gian mục tiêu');
  }
}

/**
 * Tính tổng số tuần của giáo án
 *
 * @param items Các môn của giáo án kèm số tuần
 * @returns Tổng số tuần
 */
export function totalPlanWeeks(
  items: ReadonlyArray<{ weeks: number }>,
): number {
  return items.reduce((sum, item) => sum + item.weeks, 0);
}

/**
 * Tính ngày kết thúc của lớp theo ngày bắt đầu và tổng số tuần của giáo án
 *
 * - Ngày kết thúc = ngày bắt đầu + tổng số tuần × 7 − 1 ngày
 *
 * @param startDate Ngày bắt đầu dạng YYYY-MM-DD
 * @param totalWeeks Tổng số tuần của giáo án, lớn hơn 0
 * @returns Ngày kết thúc dạng YYYY-MM-DD
 */
export function classEndDate(startDate: string, totalWeeks: number): string {
  const end = new Date(`${dateOnly(startDate)}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + totalWeeks * 7 - 1);
  return end.toISOString().slice(0, 10);
}

/**
 * Chỉ thêm hoặc sửa buổi tập khi lớp còn nháp hoặc đang chạy
 *
 * @param status Trạng thái của lớp
 * @throws ConflictException Nếu lớp đã hoàn thành hoặc đã hủy
 */
export function assertClassOpenForSessions(status: TrainingClassStatus): void {
  if (
    status !== TrainingClassStatus.DRAFT &&
    status !== TrainingClassStatus.ACTIVE
  ) {
    throw new ConflictException(
      'Lớp đã kết thúc, không thêm hoặc sửa buổi tập được',
    );
  }
}

/**
 * Định dạng một thời điểm theo giờ CLB để đưa vào câu báo
 *
 * @param value Thời điểm cần định dạng
 * @returns Chuỗi dạng "HH:mm ngày dd/mm/yyyy"
 */
function formatClubDateTime(value: Date): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
  return `${time} ngày ${toDisplayDate(toClubDate(value))}`;
}

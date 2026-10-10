import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { toClubDate } from '../../../common/utils/club-date';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import { HorseMeasurementAlert } from '../../horses/enums/horse-measurement-alert.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { ownershipAt } from '../../horses/policies/horse-ownership.policy';
import type { OwnershipPeriod } from '../../horses/types/horse.types';
import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { CheckupDueStatus } from '../constants/checkup.enum';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../constants/exam-request.enum';
import {
  CaseLockDecision,
  MedicalCaseStatus,
  VisitVoidAction,
} from '../constants/medical-case.enum';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import {
  CHECKUP_DUE_SOON_DAYS,
  CHECKUP_OVERDUE_NOTIFY_DAYS,
  MEDICAL_CHECKUP_CYCLE_DAYS,
  NO_LOCK_CHOICE_ON_DEATH_MESSAGE,
  VISIT_BACKDATE_MAX_DAYS,
} from '../constants/medical.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Các mốc để tính hạn khám định kỳ của một con ngựa, đều là ngày theo lịch câu lạc bộ (YYYY-MM-DD).
 */
export interface CheckupAnchors {
  lastVisitDate: string | null;
  createdDate: string;
  reactivatedDate: string | null;
}

/**
 * Cộng số ngày vào một ngày lịch dạng YYYY-MM-DD, không phụ thuộc múi giờ máy chạy
 *
 * @param date Ngày gốc dạng YYYY-MM-DD
 * @param days Số ngày cộng thêm, có thể âm
 * @returns Ngày kết quả dạng YYYY-MM-DD
 */
export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY;
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Số ngày từ ngày `from` tới ngày `to` (dương khi `to` ở sau), cả hai dạng YYYY-MM-DD
 *
 * @param from Ngày bắt đầu
 * @param to Ngày kết thúc
 * @returns Số ngày chênh lệch
 */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      MS_PER_DAY,
  );
}

/**
 * Tính hạn khám định kỳ kế tiếp
 *
 * - Ngựa đã chuyển nhượng vừa được kích hoạt lại mà chưa khám từ ngày đó: hạn chính là ngày kích hoạt lại
 * - Còn lại: hạn = ngày muộn nhất trong (buổi khám gần nhất chưa hủy, ngày tạo hồ sơ) + MEDICAL_CHECKUP_CYCLE_DAYS
 *
 * @param anchors Các mốc ngày của con ngựa
 * @returns Hạn khám dạng YYYY-MM-DD
 */
export function checkupDueDate(anchors: CheckupAnchors): string {
  const { lastVisitDate, createdDate, reactivatedDate } = anchors;
  if (
    reactivatedDate !== null &&
    (lastVisitDate === null || lastVisitDate < reactivatedDate)
  ) {
    return reactivatedDate;
  }
  const anchor =
    lastVisitDate !== null && lastVisitDate > createdDate
      ? lastVisitDate
      : createdDate;
  return addDays(anchor, MEDICAL_CHECKUP_CYCLE_DAYS);
}

/**
 * Xếp trạng thái hạn khám theo số ngày còn lại tới hạn
 *
 * - Còn trên CHECKUP_DUE_SOON_DAYS ngày: OK
 * - Còn từ 0 tới CHECKUP_DUE_SOON_DAYS ngày: DUE_SOON
 * - Đã qua hạn: OVERDUE
 *
 * @param dueDate Hạn khám dạng YYYY-MM-DD
 * @param today Hôm nay theo lịch câu lạc bộ, dạng YYYY-MM-DD
 * @returns Trạng thái hạn khám
 */
export function dueStatusOf(dueDate: string, today: string): CheckupDueStatus {
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft < 0) return CheckupDueStatus.OVERDUE;
  if (daysLeft <= CHECKUP_DUE_SOON_DAYS) return CheckupDueStatus.DUE_SOON;
  return CheckupDueStatus.OK;
}

/**
 * Cho biết con ngựa đã quá hạn khám trên CHECKUP_OVERDUE_NOTIFY_DAYS ngày (ngưỡng gửi thông báo HIGH)
 *
 * @param dueDate Hạn khám dạng YYYY-MM-DD
 * @param today Hôm nay theo lịch câu lạc bộ, dạng YYYY-MM-DD
 * @returns True nếu quá hạn trên số ngày ngưỡng
 */
export function isOverdueNotifiable(dueDate: string, today: string): boolean {
  return daysBetween(dueDate, today) > CHECKUP_OVERDUE_NOTIFY_DAYS;
}

/**
 * Kiểm tra thời điểm khám hợp lệ
 *
 * - Không ở tương lai
 * - Không lùi quá VISIT_BACKDATE_MAX_DAYS ngày
 * - Buổi khám trong bệnh án không sớm hơn ngày mở bệnh án
 *
 * @param examDate Thời điểm khám người dùng nhập
 * @param now Thời điểm hiện tại
 * @param caseOpenedAt Ngày mở bệnh án, chỉ truyền với buổi khám trong bệnh án
 * @throws BadRequestException Nếu thời điểm khám vi phạm một trong các luật trên
 */
export function assertVisitExamDate(
  examDate: Date,
  now: Date,
  caseOpenedAt?: Date,
): void {
  if (examDate.getTime() > now.getTime()) {
    throw new BadRequestException('Thời điểm khám không được ở tương lai');
  }
  if (
    now.getTime() - examDate.getTime() >
    VISIT_BACKDATE_MAX_DAYS * MS_PER_DAY
  ) {
    throw new BadRequestException(
      `Chỉ được nhập lùi thời điểm khám tối đa ${VISIT_BACKDATE_MAX_DAYS} ngày`,
    );
  }
  if (caseOpenedAt && examDate.getTime() < caseOpenedAt.getTime()) {
    throw new BadRequestException(
      'Thời điểm khám không được sớm hơn ngày mở bệnh án',
    );
  }
}

/**
 * Bắt buộc lý do khi đổi trạng thái sức khỏe
 *
 * @param current Trạng thái sức khỏe hiện tại
 * @param next Trạng thái sức khỏe mới
 * @param reason Lý do người dùng nhập
 * @returns True nếu trạng thái thật sự thay đổi, false nếu trùng trạng thái cũ
 * @throws BadRequestException Nếu trạng thái thay đổi mà lý do trống
 */
export function assertHealthChangeReason(
  current: HorseHealthStatus,
  next: HorseHealthStatus,
  reason: string | null | undefined,
): boolean {
  if (current === next) return false;
  if (!reason || reason.trim().length === 0) {
    throw new BadRequestException(
      'Đổi trạng thái sức khỏe bắt buộc nhập lý do',
    );
  }
  return true;
}

/**
 * Chặn ghi buổi khám ngoài bệnh án khi ngựa đang có bệnh án mở
 *
 * @param hasOpenCase Ngựa có bệnh án đang mở không
 * @throws ConflictException Nếu ngựa đang có bệnh án mở
 */
export function assertStandaloneVisitAllowed(hasOpenCase: boolean): void {
  if (hasOpenCase) {
    throw new ConflictException(
      'Ngựa đang có bệnh án mở, hãy ghi buổi khám vào bệnh án đó',
    );
  }
}

/**
 * Kiểm tra dữ liệu buổi khám ngoài bệnh án
 *
 * - Kết luận ISSUE bắt buộc chẩn đoán ban đầu
 * - Khám theo yêu cầu (REQUEST) bắt buộc gắn ít nhất một yêu cầu
 * - Chấn thương và ngày hẹn tái khám chỉ dùng khi buổi khám mở bệnh án (ISSUE)
 *
 * @param input Loại, kết luận, chẩn đoán ban đầu, số yêu cầu gắn, số chấn thương và có ngày hẹn tái khám không
 * @throws BadRequestException Nếu vi phạm một trong các luật trên
 */
export function assertStandaloneVisitInput(input: {
  kind: MedicalVisitKind;
  conclusion: MedicalVisitConclusion;
  initialDiagnosis: string | undefined;
  requestCount: number;
  injuryCount: number;
  hasNextVisit: boolean;
}): void {
  const opensCase = input.conclusion === MedicalVisitConclusion.ISSUE;
  if (opensCase && !input.initialDiagnosis) {
    throw new BadRequestException(
      'Kết luận Có vấn đề bắt buộc nhập chẩn đoán ban đầu của bệnh án',
    );
  }
  if (!opensCase && input.initialDiagnosis) {
    throw new BadRequestException(
      'Chỉ nhập chẩn đoán ban đầu khi kết luận Có vấn đề',
    );
  }
  if (input.kind === MedicalVisitKind.REQUEST && input.requestCount === 0) {
    throw new BadRequestException(
      'Khám theo yêu cầu phải gắn ít nhất một yêu cầu khám',
    );
  }
  if (!opensCase && (input.injuryCount > 0 || input.hasNextVisit)) {
    throw new BadRequestException(
      'Chấn thương và ngày hẹn tái khám chỉ ghi khi buổi khám mở bệnh án',
    );
  }
}

/**
 * Ngày hẹn tái khám không được ở quá khứ, so theo ngày lịch câu lạc bộ
 *
 * @param nextVisitAt Ngày hẹn tái khám
 * @param now Thời điểm hiện tại
 * @throws BadRequestException Nếu ngày hẹn ở quá khứ
 */
export function assertNextVisitAt(nextVisitAt: Date, now: Date): void {
  if (toClubDate(nextVisitAt) < toClubDate(now)) {
    throw new BadRequestException('Ngày hẹn tái khám không được ở quá khứ');
  }
}

/**
 * Chỉ gắn được yêu cầu khám đang chờ của chính con ngựa đó
 *
 * @param requestedIds Các id yêu cầu người dùng gửi lên
 * @param found Các yêu cầu tìm được trong DB
 * @param horseId UUID của ngựa đang khám
 * @throws ConflictException Nếu có yêu cầu không tồn tại, thuộc ngựa khác hoặc không còn Chờ xử lý
 */
export function assertRequestsAttachable(
  requestedIds: string[],
  found: Array<{ id: string; horseId: string; status: ExamRequestStatus }>,
  horseId: string,
): void {
  const valid = found.filter(
    (request) =>
      request.horseId === horseId &&
      request.status === ExamRequestStatus.PENDING,
  );
  if (valid.length !== requestedIds.length) {
    throw new ConflictException(
      'Có yêu cầu khám không còn chờ xử lý hoặc không thuộc con ngựa này',
    );
  }
}

/**
 * Buổi khám thay thế chỉ trỏ tới buổi khám đã hủy của cùng con ngựa
 *
 * @param replaced Buổi khám bị thay, hoặc null nếu không tìm thấy
 * @param horseId UUID của ngựa đang khám
 * @throws ConflictException Nếu không có buổi khám đó, khác ngựa hoặc chưa bị hủy
 */
export function assertReplacementTarget(
  replaced: { horseId: string; voidedAt: Date | null } | null,
  horseId: string,
): void {
  if (!replaced || replaced.horseId !== horseId || !replaced.voidedAt) {
    throw new ConflictException(
      'Chỉ ghi thay cho buổi khám đã hủy của cùng con ngựa',
    );
  }
}

/**
 * Bệnh án phải còn Đang điều trị
 *
 * @param status Trạng thái bệnh án
 * @throws ConflictException Nếu bệnh án đã đóng
 */
export function assertCaseOpen(status: MedicalCaseStatus): void {
  if (status !== MedicalCaseStatus.OPEN) {
    throw new ConflictException(
      'Bệnh án không còn đang điều trị (đã đóng hoặc đã hủy), chỉ được xem',
    );
  }
}

/**
 * Quyết định việc cần làm khi hủy một buổi khám
 *
 * - Buổi đã hủy: 409
 * - Buổi ngoài bệnh án, hoặc buổi tái khám (kể cả của bệnh án đã đóng): chỉ hủy buổi đó
 * - Buổi mở bệnh án: chỉ hủy được khi bệnh án còn đang điều trị và không còn buổi nào khác chưa hủy; khi đó bệnh án chuyển Đã hủy
 *
 * @param visit Buổi khám cần hủy
 * @param caseStatus Trạng thái bệnh án chứa buổi khám, null nếu buổi ngoài bệnh án
 * @param otherActiveVisits Số buổi khám khác chưa hủy trong cùng bệnh án
 * @returns Việc cần làm: chỉ hủy buổi, hoặc hủy buổi kèm hủy bệnh án
 * @throws ConflictException Nếu buổi đã hủy, hoặc buổi mở bệnh án mà bệnh án đã đóng hay còn buổi khác
 */
export function resolveVisitVoid(
  visit: { voidedAt: Date | null; conclusion: MedicalVisitConclusion | null },
  caseStatus: MedicalCaseStatus | null,
  otherActiveVisits: number,
): VisitVoidAction {
  if (visit.voidedAt) {
    throw new ConflictException('Buổi khám đã bị hủy trước đó');
  }
  const isOpeningVisit =
    caseStatus !== null && visit.conclusion === MedicalVisitConclusion.ISSUE;
  if (!isOpeningVisit) return VisitVoidAction.VOID;
  if (caseStatus !== MedicalCaseStatus.OPEN) {
    throw new ConflictException(
      'Không hủy được buổi mở bệnh án của bệnh án đã đóng',
    );
  }
  if (otherActiveVisits > 0) {
    throw new ConflictException(
      'Bệnh án còn buổi khám khác, hãy hủy các buổi đó trước khi hủy buổi mở bệnh án',
    );
  }
  return VisitVoidAction.VOID_AND_CANCEL_CASE;
}

/**
 * Chọn cách xử lý lệnh khóa gắn với bệnh án khi đóng bệnh án
 *
 * @param hasActiveLock Bệnh án có lệnh khóa còn hiệu lực không
 * @param decision Lựa chọn của bác sĩ
 * @param expectedEnd Ngày dự kiến gỡ khi giữ khóa
 * @param now Thời điểm hiện tại
 * @returns NONE nếu không có khóa, còn lại là lựa chọn đã hợp lệ
 * @throws BadRequestException Nếu còn khóa mà không chọn, hoặc giữ khóa mà ngày dự kiến gỡ trống hay ở quá khứ
 */
export function resolveLockOnClose(
  hasActiveLock: boolean,
  decision: CaseLockDecision | undefined,
  expectedEnd: Date | undefined,
  now: Date,
): CaseLockDecision | 'NONE' {
  if (!hasActiveLock) return 'NONE';
  if (!decision) {
    throw new BadRequestException(
      'Lệnh khóa huấn luyện của bệnh án còn hiệu lực, hãy chọn gỡ khóa hoặc giữ khóa',
    );
  }
  if (
    decision === CaseLockDecision.KEEP &&
    (!expectedEnd || toClubDate(expectedEnd) < toClubDate(now))
  ) {
    throw new BadRequestException(
      'Giữ khóa phải kèm ngày dự kiến gỡ không ở quá khứ',
    );
  }
  return decision;
}

/**
 * Chặn chọn cách xử lý lệnh khóa khi đóng bệnh án kèm ghi nhận ngựa mất
 *
 * - Lệnh khóa của ngựa mất được gỡ theo luồng ghi nhận mất, bác sĩ không chọn gỡ hay giữ
 *
 * @param decision Lựa chọn gỡ hoặc giữ khóa trong request
 * @param expectedEnd Ngày dự kiến gỡ trong request
 * @throws BadRequestException Nếu có gửi lockDecision hoặc lockExpectedEnd, lỗi gắn ô tương ứng
 */
export function assertNoLockChoiceOnDeath(
  decision: CaseLockDecision | undefined,
  expectedEnd: string | undefined,
): void {
  if (decision !== undefined) {
    throw fieldBadRequest('lockDecision', NO_LOCK_CHOICE_ON_DEATH_MESSAGE);
  }
  if (expectedEnd !== undefined) {
    throw fieldBadRequest('lockExpectedEnd', NO_LOCK_CHOICE_ON_DEATH_MESSAGE);
  }
}

/**
 * Chỉ điều chỉnh chi phí của bệnh án đã đóng
 *
 * @param status Trạng thái bệnh án
 * @throws ConflictException Nếu bệnh án chưa đóng
 */
export function assertCostAdjustable(status: MedicalCaseStatus): void {
  if (status !== MedicalCaseStatus.CLOSED) {
    throw new ConflictException('Chỉ điều chỉnh chi phí của bệnh án đã đóng');
  }
}

/**
 * Kiểm tra chi phí của bệnh án có thuộc về một chủ không
 *
 * - Bệnh án chưa đóng (chưa có chi phí chốt): luôn thuộc
 * - Bệnh án đã đóng: thuộc chủ của giai đoạn sở hữu chứa thời điểm đóng
 *
 * @param medicalCase Trạng thái và thời điểm đóng của bệnh án
 * @param periods Các giai đoạn sở hữu của con ngựa
 * @param ownerId UUID của chủ cần kiểm
 * @returns True nếu chi phí bệnh án thuộc về chủ này
 */
export function isCaseCostOfOwner(
  medicalCase: { status: MedicalCaseStatus; closedAt: Date | null },
  periods: OwnershipPeriod[],
  ownerId: string,
): boolean {
  if (
    medicalCase.status !== MedicalCaseStatus.CLOSED ||
    !medicalCase.closedAt
  ) {
    return true;
  }
  return ownershipAt(periods, medicalCase.closedAt)?.ownerId === ownerId;
}

/**
 * Người gọi có được xem chi phí y tế không: Head Trainer không bao giờ thấy
 *
 * @param roles Vai trò của người gọi
 * @returns True với Club Manager, Veterinarian, Horse Owner
 */
export function canSeeMedicalCost(roles: UserRole[]): boolean {
  return [
    UserRole.CLUB_MANAGER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ].some((role) => roles.includes(role));
}

/**
 * Người gọi chỉ có vai trò Groom (không kèm vai trò xem toàn câu lạc bộ), nên chỉ được xem ngựa mình đang phụ trách
 *
 * @param roles Vai trò của người gọi
 * @returns True nếu có GROOM và không có Veterinarian, Club Manager, Head Trainer, Horse Owner
 */
export function isGroomOnly(roles: UserRole[]): boolean {
  return (
    roles.includes(UserRole.GROOM) &&
    ![
      UserRole.VETERINARIAN,
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.HORSE_OWNER,
    ].some((role) => roles.includes(role))
  );
}

/**
 * Người gọi chỉ có vai trò Groom trong số các vai trò được xem yêu cầu khám, nên chỉ thấy yêu cầu của ngựa mình đang phụ trách
 *
 * - Horse Owner không xem được yêu cầu khám nên không mở rộng phạm vi của Groom
 *
 * @param roles Vai trò của người gọi
 * @returns True nếu có GROOM và không có Veterinarian, Club Manager, Head Trainer
 */
export function isGroomOnlyForExamRequests(roles: UserRole[]): boolean {
  return (
    roles.includes(UserRole.GROOM) &&
    ![UserRole.VETERINARIAN, UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER].some(
      (role) => roles.includes(role),
    )
  );
}

/**
 * Người gọi có được xem liều lượng, tần suất đơn thuốc không: Horse Owner thì không
 *
 * @param roles Vai trò của người gọi
 * @returns True với Club Manager, Head Trainer, Veterinarian
 */
export function canSeeDosage(roles: UserRole[]): boolean {
  return [
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
  ].some((role) => roles.includes(role));
}

/**
 * Kiểm tra người gọi được gửi yêu cầu khám cho con ngựa
 *
 * - Veterinarian, Club Manager: mọi ngựa
 * - Head Trainer: ngựa thuộc khu mình phụ trách
 * - Vai trò khác (kể cả Groom): không được gửi
 *
 * @param input Vai trò, ngựa có thuộc khu của Head Trainer không
 * @throws ForbiddenException Nếu người gọi không được gửi yêu cầu cho con ngựa này
 */
export function assertCanRequestExam(input: {
  roles: UserRole[];
  isInTrainerBarn: boolean;
}): void {
  const allowed =
    input.roles.includes(UserRole.VETERINARIAN) ||
    input.roles.includes(UserRole.CLUB_MANAGER) ||
    (input.roles.includes(UserRole.HEAD_TRAINER) && input.isInTrainerBarn);
  if (!allowed) {
    throw new ForbiddenException(
      'Bạn không được gửi yêu cầu khám cho con ngựa này',
    );
  }
}

/**
 * Chọn nguồn gốc yêu cầu khám theo vai trò người gửi, ưu tiên vai trò có quyền rộng hơn
 *
 * @param roles Vai trò của người gửi (Veterinarian, Club Manager hoặc Head Trainer)
 * @returns VET nếu có vai trò Veterinarian, còn lại STAFF
 */
export function examRequestSourceFor(roles: UserRole[]): ExamRequestSource {
  return roles.includes(UserRole.VETERINARIAN)
    ? ExamRequestSource.VET
    : ExamRequestSource.STAFF;
}

/**
 * Mức độ của yêu cầu khám tự sinh từ cảnh báo chỉ số: sốt là Khẩn, sụt cân là Bình thường
 *
 * @param alert Loại cảnh báo
 * @returns True nếu yêu cầu là Khẩn
 */
export function isUrgentAlert(alert: HorseMeasurementAlert): boolean {
  return alert === HorseMeasurementAlert.FEVER;
}

/**
 * Chỉ xử lý yêu cầu khám còn Chờ xử lý; Đã khám và Đã bỏ qua là trạng thái cuối
 *
 * @param status Trạng thái yêu cầu khám
 * @throws ConflictException Nếu yêu cầu không còn chờ
 */
export function assertRequestPending(status: ExamRequestStatus): void {
  if (status !== ExamRequestStatus.PENDING) {
    throw new ConflictException('Yêu cầu khám đã được xử lý');
  }
}

/**
 * Mỗi con ngựa có tối đa một lệnh khóa đang hiệu lực
 *
 * @param hasActiveLock Ngựa đang có lệnh khóa hiệu lực không
 * @throws ConflictException Nếu ngựa đã có lệnh khóa đang hiệu lực
 */
export function assertNoActiveLock(hasActiveLock: boolean): void {
  if (hasActiveLock) {
    throw new ConflictException('Ngựa đang có lệnh khóa huấn luyện hiệu lực');
  }
}

/**
 * Chỉ gỡ được lệnh khóa đang hiệu lực
 *
 * @param status Trạng thái lệnh khóa
 * @throws ConflictException Nếu lệnh khóa đã được gỡ
 */
export function assertLockActive(status: TrainingLockStatus): void {
  if (status !== TrainingLockStatus.ACTIVE) {
    throw new ConflictException('Lệnh khóa huấn luyện đã được gỡ');
  }
}

/**
 * Ngày dự kiến gỡ khóa không được ở quá khứ, so theo ngày lịch câu lạc bộ
 *
 * @param lockEnd Ngày dự kiến gỡ
 * @param now Thời điểm hiện tại
 * @throws BadRequestException Nếu ngày dự kiến gỡ ở quá khứ
 */
export function assertLockEnd(lockEnd: Date, now: Date): void {
  if (toClubDate(lockEnd) < toClubDate(now)) {
    throw new BadRequestException('Ngày dự kiến gỡ khóa không được ở quá khứ');
  }
}

/**
 * Tính hạn khám, số ngày còn lại và trạng thái hạn của một con ngựa
 *
 * @param anchors Các mốc ngày của con ngựa
 * @param today Hôm nay theo lịch câu lạc bộ
 * @returns Hạn khám, số ngày còn lại (âm là quá hạn) và trạng thái hạn
 */
export function checkupStateOf(
  anchors: CheckupAnchors,
  today: string,
): { dueDate: string; daysLeft: number; dueStatus: CheckupDueStatus } {
  const dueDate = checkupDueDate(anchors);
  return {
    dueDate,
    daysLeft: daysBetween(today, dueDate),
    dueStatus: dueStatusOf(dueDate, today),
  };
}

/**
 * Kiểm tra ngày hẹn khám định kỳ
 *
 * - Không ở quá khứ
 * - Ngựa chưa quá hạn thì không muộn hơn hạn khám; đã quá hạn thì chọn ngày bất kỳ từ hôm nay
 *
 * @param appointmentDate Ngày hẹn theo lịch câu lạc bộ
 * @param today Hôm nay theo lịch câu lạc bộ
 * @param dueDate Hạn khám của con ngựa
 * @throws BadRequestException Nếu ngày hẹn vi phạm một trong các luật trên
 */
export function assertAppointmentDate(
  appointmentDate: string,
  today: string,
  dueDate: string,
): void {
  if (appointmentDate < today) {
    throw new BadRequestException('Ngày hẹn khám không được ở quá khứ');
  }
  if (dueDate >= today && appointmentDate > dueDate) {
    throw new BadRequestException(
      `Ngày hẹn khám không được muộn hơn hạn khám ${dueDate}`,
    );
  }
}

/**
 * Dời ngày của lịch đã đặt bắt buộc lý do (ngày hẹn khám định kỳ hoặc lịch chăm sóc)
 *
 * @param hasAppointment Lịch đã có ngày cần dời không (ngựa đã có ngày hẹn, hoặc ngày đến hạn thay đổi)
 * @param reason Lý do người dùng nhập
 * @throws BadRequestException Nếu dời lịch mà không có lý do
 */
export function assertRescheduleReason(
  hasAppointment: boolean,
  reason: string | undefined,
): void {
  if (hasAppointment && !reason) {
    throw new BadRequestException('Dời ngày bắt buộc nhập lý do');
  }
}

/**
 * Thứ tự ưu tiên trong sơ đồ đàn ngựa: Cách ly, Chấn thương, Cần theo dõi, Đủ điều kiện
 *
 * @param status Trạng thái sức khỏe
 * @returns Số nhỏ hơn đứng trước
 */
export function healthPriority(status: HorseHealthStatus): number {
  switch (status) {
    case HorseHealthStatus.QUARANTINED:
      return 0;
    case HorseHealthStatus.INJURED:
      return 1;
    case HorseHealthStatus.UNDER_OBSERVATION:
      return 2;
    case HorseHealthStatus.ELIGIBLE:
      return 3;
  }
}

/**
 * Chỉ dời, sửa, hủy hoặc hoàn tất lịch chăm sóc còn Đã lên lịch
 *
 * @param status Trạng thái lịch chăm sóc
 * @throws ConflictException Nếu lịch đã Hoàn tất hoặc Đã hủy
 */
export function assertCareScheduleOpen(status: CareScheduleStatus): void {
  if (status !== CareScheduleStatus.SCHEDULED) {
    throw new ConflictException('Lịch chăm sóc đã hoàn tất hoặc đã hủy');
  }
}

/**
 * Ngày đến hạn của lịch chăm sóc không được ở quá khứ
 *
 * @param dueDate Ngày đến hạn theo lịch câu lạc bộ
 * @param today Hôm nay theo lịch câu lạc bộ
 * @throws BadRequestException Nếu ngày đến hạn ở quá khứ
 */
export function assertCareDueDate(dueDate: string, today: string): void {
  if (dueDate < today) {
    throw new BadRequestException('Ngày đến hạn không được ở quá khứ');
  }
}

/**
 * Chỉ Veterinarian hoặc đúng người được giao mới đánh dấu hoàn tất lịch chăm sóc
 *
 * @param roles Vai trò người gọi
 * @param isAssignee Người gọi có phải người được giao không
 * @throws ForbiddenException Nếu người gọi không được hoàn tất lịch này
 */
export function assertCanCompleteCareSchedule(
  roles: UserRole[],
  isAssignee: boolean,
): void {
  if (!roles.includes(UserRole.VETERINARIAN) && !isAssignee) {
    throw new ForbiddenException(
      'Bạn chỉ hoàn tất được lịch chăm sóc được giao cho mình',
    );
  }
}

/**
 * Chỉ Veterinarian được hẹn lịch lần tới khi hoàn tất lịch chăm sóc
 *
 * @param roles Vai trò người gọi
 * @param hasNext Người gọi có nhập ngày đến hạn lần tới không
 * @throws ForbiddenException Nếu không phải Veterinarian mà nhập ngày lần tới
 */
export function assertCanScheduleNext(
  roles: UserRole[],
  hasNext: boolean,
): void {
  if (hasNext && !roles.includes(UserRole.VETERINARIAN)) {
    throw new ForbiddenException('Chỉ bác sĩ được hẹn lịch chăm sóc lần tới');
  }
}

/**
 * Một chấn thương được định danh bằng (vùng cơ thể, loại) trong một bệnh án; mỗi buổi khám ghi tối đa một dòng cho mỗi cặp
 *
 * @param injuries Các chấn thương ghi trong buổi khám
 * @throws BadRequestException Nếu có hai dòng cùng vùng cơ thể và cùng loại
 */
export function assertDistinctInjuries(
  injuries: Array<{ bodyRegion: string; injuryType: string }>,
): void {
  const keys = injuries.map((item) => `${item.bodyRegion}|${item.injuryType}`);
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestException(
      'Mỗi buổi khám chỉ ghi một dòng cho mỗi cặp vùng cơ thể và loại chấn thương',
    );
  }
}

/**
 * Ngày kết thúc đơn thuốc không được sớm hơn ngày bắt đầu
 *
 * @param prescriptions Các dòng đơn thuốc, ngày dạng YYYY-MM-DD
 * @throws BadRequestException Nếu có dòng kết thúc trước khi bắt đầu
 */
export function assertPrescriptionDates(
  prescriptions: Array<{ startDate: string; endDate?: string }>,
): void {
  if (
    prescriptions.some((item) => item.endDate && item.endDate < item.startDate)
  ) {
    throw new BadRequestException(
      'Ngày kết thúc đơn thuốc không được sớm hơn ngày bắt đầu',
    );
  }
}

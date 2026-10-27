import { BadRequestException, ConflictException } from '@nestjs/common';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { RecoveryStatus } from '../constants/injury-marker.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import {
  MedicalVisitConclusion,
  VisitEditHealthOutcome,
} from '../constants/medical-visit.enum';

/**
 * Việc với bệnh án khi sửa kết luận của buổi khám ngoài bệnh án.
 */
export type ConclusionChange = 'NONE' | 'OPEN_CASE' | 'CANCEL_CASE';

const CASE_ONLY_FIELDS = ['kind', 'conclusion', 'initialDiagnosis'] as const;

/**
 * Lần sửa phải có ít nhất một ô cần sửa ngoài lý do và cờ xác nhận số đo bất thường
 *
 * @param body Nội dung lần sửa
 * @throws BadRequestException Nếu không có ô nào cần sửa
 */
export function assertVisitEditHasChanges(body: object): void {
  const sent = Object.entries(body).filter(
    ([key, value]) =>
      value !== undefined && key !== 'reason' && key !== 'confirmAbnormal',
  );
  if (sent.length === 0) {
    throw new BadRequestException('Không có nội dung nào để sửa');
  }
}

/**
 * Chỉ sửa buổi khám chưa hủy
 *
 * @param voidedAt Thời điểm hủy buổi khám, null nếu chưa hủy
 * @throws ConflictException Nếu buổi khám đã hủy
 */
export function assertVisitEditable(voidedAt: Date | null): void {
  if (voidedAt !== null) {
    throw new ConflictException('Buổi khám đã hủy, không sửa được');
  }
}

/**
 * Buổi tái khám không có loại, kết luận và chẩn đoán ban đầu riêng
 *
 * @param isFollowUp Buổi khám có phải buổi tái khám không
 * @param body Nội dung lần sửa
 * @throws BadRequestException Nếu buổi tái khám gửi kind, conclusion hoặc initialDiagnosis
 */
export function assertFollowUpEditFields(
  isFollowUp: boolean,
  body: Partial<Record<(typeof CASE_ONLY_FIELDS)[number], unknown>>,
): void {
  if (!isFollowUp) return;
  if (CASE_ONLY_FIELDS.some((field) => body[field] !== undefined)) {
    throw new BadRequestException(
      'Buổi tái khám không sửa loại, kết luận hay chẩn đoán ban đầu',
    );
  }
}

/**
 * Giới hạn sửa buổi khám thuộc bệnh án đã đóng
 *
 * - Đặt ngày hẹn tái khám: 400
 * - Gắn thêm yêu cầu khám: 409
 *
 * @param input Bệnh án đã đóng không, có đặt ngày hẹn mới không và số yêu cầu gắn thêm
 * @throws BadRequestException Nếu đặt ngày hẹn tái khám
 * @throws ConflictException Nếu gắn thêm yêu cầu khám
 */
export function assertClosedCaseEdit(input: {
  caseClosed: boolean;
  setsNextVisit: boolean;
  addedRequestCount: number;
}): void {
  if (!input.caseClosed) return;
  if (input.setsNextVisit) {
    throw new BadRequestException(
      'Bệnh án đã đóng, không đặt ngày hẹn tái khám',
    );
  }
  if (input.addedRequestCount > 0) {
    throw new ConflictException('Bệnh án đã đóng, không gắn thêm yêu cầu khám');
  }
}

/**
 * Xác định việc với bệnh án khi kết luận đổi
 *
 * @param from Kết luận hiện tại
 * @param to Kết luận sau khi sửa
 * @returns NONE nếu không đổi, OPEN_CASE khi NORMAL sang ISSUE, CANCEL_CASE khi ISSUE sang NORMAL
 */
export function resolveConclusionChange(
  from: MedicalVisitConclusion | null,
  to: MedicalVisitConclusion | null,
): ConclusionChange {
  if (from === to) return 'NONE';
  return to === MedicalVisitConclusion.ISSUE ? 'OPEN_CASE' : 'CANCEL_CASE';
}

/**
 * Điều kiện mở bệnh án khi sửa buổi khám sang Có vấn đề
 *
 * - Ngựa đang có bệnh án mở: 409
 * - Đã có buổi khám chưa hủy sau buổi đang sửa: 409, phải ghi buổi khám mới để mở bệnh án
 *
 * @param input Ngựa có bệnh án mở không và số buổi khám chưa hủy sau buổi đang sửa
 * @throws ConflictException Nếu vi phạm một trong các luật trên
 */
export function assertCaseOpenableByEdit(input: {
  hasOpenCase: boolean;
  laterVisitCount: number;
}): void {
  if (input.hasOpenCase) {
    throw new ConflictException(
      'Ngựa đang có bệnh án mở, không mở thêm bệnh án',
    );
  }
  if (input.laterVisitCount > 0) {
    throw new ConflictException(
      'Đã có buổi khám sau buổi này, hãy ghi buổi khám mới để mở bệnh án',
    );
  }
}

/**
 * Điều kiện hủy bệnh án khi sửa buổi mở bệnh án sang Bình thường
 *
 * @param caseStatus Trạng thái bệnh án buổi khám đã mở
 * @param otherActiveVisits Số buổi khám khác chưa hủy trong bệnh án
 * @throws ConflictException Nếu bệnh án không còn đang điều trị hoặc còn buổi khám khác
 */
export function assertCaseCancellableByEdit(
  caseStatus: MedicalCaseStatus,
  otherActiveVisits: number,
): void {
  if (caseStatus !== MedicalCaseStatus.OPEN) {
    throw new ConflictException(
      'Bệnh án đã đóng, không đổi kết luận buổi mở bệnh án',
    );
  }
  if (otherActiveVisits > 0) {
    throw new ConflictException(
      'Bệnh án còn buổi khám khác, hãy hủy các buổi đó trước khi đổi kết luận',
    );
  }
}

/**
 * Kiểm các chấn thương cần sửa hoặc xóa trong buổi khám
 *
 * - Mỗi chấn thương chỉ xuất hiện một lần, không vừa sửa vừa xóa: 400
 * - Chấn thương phải có ghi nhận trong buổi khám: 400
 * - Sửa vùng, loại, vị trí hoặc xóa chỉ với chấn thương phát hiện ở buổi khám này: 400
 * - Xóa chấn thương mà buổi khám khác (kể cả đã hủy) đã ghi nhận: 409
 *
 * @param input Chấn thương sửa (kèm có sửa thông tin cố định không), id chấn thương xóa, chấn thương của buổi khám (kèm có phát hiện ở buổi này không) và số ghi nhận ở buổi khám khác của từng chấn thương xóa
 * @throws BadRequestException Nếu vi phạm luật 400 ở trên
 * @throws ConflictException Nếu xóa chấn thương đã có buổi khám khác ghi nhận
 */
export function assertInjuryEdits(input: {
  edits: Array<{ injuryId: string; changesFixedInfo: boolean }>;
  removedIds: string[];
  firstDetectedHere: Map<string, boolean>;
  otherMarkerCounts: Map<string, number>;
}): void {
  const ids = [
    ...input.edits.map((edit) => edit.injuryId),
    ...input.removedIds,
  ];
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(
      'Mỗi chấn thương chỉ sửa hoặc xóa một lần trong một lần sửa',
    );
  }
  if (ids.some((id) => !input.firstDetectedHere.has(id))) {
    throw new BadRequestException('Chấn thương không có trong buổi khám này');
  }
  const needsFirst = [
    ...input.edits
      .filter((edit) => edit.changesFixedInfo)
      .map((edit) => edit.injuryId),
    ...input.removedIds,
  ];
  if (needsFirst.some((id) => !input.firstDetectedHere.get(id))) {
    throw new BadRequestException(
      'Chỉ sửa vùng, loại, vị trí hoặc xóa chấn thương được phát hiện ở buổi khám này',
    );
  }
  if (
    input.removedIds.some((id) => (input.otherMarkerCounts.get(id) ?? 0) > 0)
  ) {
    throw new ConflictException(
      'Chấn thương đã được buổi khám khác ghi nhận, không xóa được',
    );
  }
}

/**
 * Bệnh án đã đóng thì các chấn thương bị sửa phải vẫn ở mức đã lành
 *
 * @param caseClosed Buổi khám thuộc bệnh án đã đóng không
 * @param statuses Mức hồi phục hiện tại (sau khi sửa) của các chấn thương bị sửa
 * @throws ConflictException Nếu bệnh án đã đóng mà có chấn thương bị sửa chưa lành
 */
export function assertClosedCaseInjuriesHealed(
  caseClosed: boolean,
  statuses: Array<RecoveryStatus | undefined>,
): void {
  if (!caseClosed) return;
  if (statuses.some((status) => status !== RecoveryStatus.HEALED)) {
    throw new ConflictException(
      'Bệnh án đã đóng, chấn thương phải ở mức đã lành',
    );
  }
}

/**
 * Quyết định trạng thái sức khỏe khi sửa trạng thái sau khám của buổi khám
 *
 * - Giá trị mới trùng kết quả cũ của buổi khám: UNCHANGED
 * - Sau buổi khám đã có lần đổi sức khỏe khác, hoặc sức khỏe hiện tại khác kết quả cũ của buổi khám: KEPT_LATER_CHANGE
 * - Còn lại: UPDATED, đổi cả sức khỏe hiện tại của ngựa
 *
 * @param input Kết quả cũ, giá trị mới, sức khỏe hiện tại và có lần đổi sức khỏe nào sau buổi khám không
 * @returns Cách xử lý trạng thái sức khỏe
 */
export function resolveEditHealth(input: {
  resultingStatus: HorseHealthStatus;
  nextStatus: HorseHealthStatus;
  currentStatus: HorseHealthStatus;
  hasLaterChange: boolean;
}): VisitEditHealthOutcome {
  if (input.nextStatus === input.resultingStatus) {
    return VisitEditHealthOutcome.UNCHANGED;
  }
  if (input.hasLaterChange || input.currentStatus !== input.resultingStatus) {
    return VisitEditHealthOutcome.KEPT_LATER_CHANGE;
  }
  return VisitEditHealthOutcome.UPDATED;
}

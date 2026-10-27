import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import type { CareScheduleEntity } from '../entities/care-schedule.entity';
import type { MedicalRecordEntity } from '../entities/medical-record.entity';

/**
 * Lý do ghi vào lịch tái khám khi lịch bị hủy theo bệnh án hoặc buổi khám
 */
export const FOLLOW_UP_CANCEL_REASONS = {
  VISIT_VOIDED: 'Buổi khám đặt lịch đã hủy',
  [MedicalCaseStatus.CLOSED]: 'Bệnh án đã đóng',
  [MedicalCaseStatus.CANCELLED]: 'Bệnh án đã hủy',
} as const;

/**
 * Trạng thái một lịch tái khám phải có sau khi đồng bộ
 */
export type FollowUpState = Pick<
  CareScheduleEntity,
  'status' | 'completedAt' | 'completedBy' | 'cancelReason'
>;

/**
 * Tính trạng thái một lịch tái khám phải có theo các buổi khám chưa hủy của bệnh án
 *
 * @param caseStatus Trạng thái bệnh án
 * @param active Các buổi khám chưa hủy của bệnh án, cũ nhất trước
 * @param schedule Lịch tái khám
 * @returns Trạng thái, thời điểm và người hoàn tất, lý do hủy của lịch
 */
export function followUpStateOf(
  caseStatus: MedicalCaseStatus,
  active: Pick<MedicalRecordEntity, 'id' | 'examDate' | 'vetId'>[],
  schedule: Pick<CareScheduleEntity, 'recordId'>,
): FollowUpState {
  const cancelled = (cancelReason: string): FollowUpState => ({
    status: CareScheduleStatus.CANCELLED,
    completedAt: null,
    completedBy: null,
    cancelReason,
  });
  const index = active.findIndex((visit) => visit.id === schedule.recordId);
  if (index === -1) return cancelled(FOLLOW_UP_CANCEL_REASONS.VISIT_VOIDED);
  const next = active[index + 1];
  if (next) {
    return {
      status: CareScheduleStatus.COMPLETED,
      completedAt: next.examDate,
      completedBy: next.vetId,
      cancelReason: null,
    };
  }
  if (caseStatus !== MedicalCaseStatus.OPEN) {
    return cancelled(FOLLOW_UP_CANCEL_REASONS[caseStatus]);
  }
  return {
    status: CareScheduleStatus.SCHEDULED,
    completedAt: null,
    completedBy: null,
    cancelReason: null,
  };
}

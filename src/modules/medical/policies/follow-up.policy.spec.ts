import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { FOLLOW_UP_CANCEL_REASONS, followUpStateOf } from './follow-up.policy';

const visit = (id: string, day: number, vetId = 'vet-1') => ({
  id,
  examDate: new Date(`2026-10-${String(day).padStart(2, '0')}T02:00:00Z`),
  vetId,
});

describe('followUpStateOf', () => {
  const active = [visit('v1', 1), visit('v2', 5, 'vet-2'), visit('v3', 9)];

  it('keeps the follow-up of the latest visit scheduled while the case is open', () => {
    expect(
      followUpStateOf(MedicalCaseStatus.OPEN, active, { recordId: 'v3' }),
    ).toEqual({
      status: CareScheduleStatus.SCHEDULED,
      completedAt: null,
      completedBy: null,
      cancelReason: null,
    });
  });

  it('completes an older follow-up with the next active visit', () => {
    expect(
      followUpStateOf(MedicalCaseStatus.OPEN, active, { recordId: 'v1' }),
    ).toEqual({
      status: CareScheduleStatus.COMPLETED,
      completedAt: active[1].examDate,
      completedBy: 'vet-2',
      cancelReason: null,
    });
  });

  it.each([MedicalCaseStatus.CLOSED, MedicalCaseStatus.CANCELLED] as const)(
    'cancels the latest follow-up once the case is %s',
    (status) => {
      expect(followUpStateOf(status, active, { recordId: 'v3' })).toMatchObject(
        {
          status: CareScheduleStatus.CANCELLED,
          cancelReason: FOLLOW_UP_CANCEL_REASONS[status],
        },
      );
    },
  );

  it('keeps an older follow-up completed even after the case is closed', () => {
    expect(
      followUpStateOf(MedicalCaseStatus.CLOSED, active, { recordId: 'v2' }),
    ).toMatchObject({ status: CareScheduleStatus.COMPLETED });
  });

  it('cancels the follow-up of a voided visit', () => {
    expect(
      followUpStateOf(MedicalCaseStatus.OPEN, active, { recordId: 'gone' }),
    ).toMatchObject({
      status: CareScheduleStatus.CANCELLED,
      cancelReason: FOLLOW_UP_CANCEL_REASONS.VISIT_VOIDED,
    });
  });
});

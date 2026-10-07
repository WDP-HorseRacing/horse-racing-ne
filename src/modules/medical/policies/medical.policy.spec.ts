import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { CheckupDueStatus } from '../constants/checkup.enum';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../constants/exam-request.enum';
import { HorseMeasurementAlert } from '../../horses/enums/horse-measurement-alert.enum';
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
  addDays,
  assertCanCompleteCareSchedule,
  assertCareDueDate,
  assertCareScheduleOpen,
  assertAppointmentDate,
  assertRescheduleReason,
  checkupStateOf,
  healthPriority,
  assertLockActive,
  assertLockEnd,
  assertNoActiveLock,
  assertCanRequestExam,
  assertRequestPending,
  examRequestSourceFor,
  isUrgentAlert,
  assertCaseOpen,
  assertCostAdjustable,
  assertNextVisitAt,
  assertReplacementTarget,
  assertRequestsAttachable,
  assertStandaloneVisitAllowed,
  assertStandaloneVisitInput,
  resolveVisitVoid,
  canSeeDosage,
  isGroomOnly,
  isGroomOnlyForExamRequests,
  canSeeMedicalCost,
  resolveLockOnClose,
  assertNoLockChoiceOnDeath,
  assertHealthChangeReason,
  assertVisitExamDate,
  checkupDueDate,
  daysBetween,
  dueStatusOf,
  isOverdueNotifiable,
} from './medical.policy';

describe('medical.policy', () => {
  describe('date helpers', () => {
    it('adds days across a month boundary', () => {
      expect(addDays('2026-09-01', 30)).toBe('2026-10-01');
      expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    });

    it('counts days between two calendar dates', () => {
      expect(daysBetween('2026-09-27', '2026-10-01')).toBe(4);
      expect(daysBetween('2026-10-01', '2026-09-27')).toBe(-4);
    });
  });

  describe('checkupDueDate', () => {
    it('adds the 30-day cycle to the last visit when it is the latest anchor', () => {
      expect(
        checkupDueDate({
          lastVisitDate: '2026-09-01',
          createdDate: '2026-01-10',
          reactivatedDate: null,
        }),
      ).toBe('2026-10-01');
    });

    it('uses the profile creation date for a horse never examined', () => {
      expect(
        checkupDueDate({
          lastVisitDate: null,
          createdDate: '2026-09-20',
          reactivatedDate: null,
        }),
      ).toBe('2026-10-20');
    });

    it('makes a reactivated horse due on the reactivation day until it is examined', () => {
      expect(
        checkupDueDate({
          lastVisitDate: '2025-03-01',
          createdDate: '2024-01-01',
          reactivatedDate: '2026-09-25',
        }),
      ).toBe('2026-09-25');
    });

    it('counts the cycle from a visit made after the reactivation', () => {
      expect(
        checkupDueDate({
          lastVisitDate: '2026-09-26',
          createdDate: '2024-01-01',
          reactivatedDate: '2026-09-25',
        }),
      ).toBe('2026-10-26');
    });

    it('treats a visit on the reactivation day as the check after coming back', () => {
      expect(
        checkupDueDate({
          lastVisitDate: '2026-09-25',
          createdDate: '2024-01-01',
          reactivatedDate: '2026-09-25',
        }),
      ).toBe('2026-10-25');
    });
  });

  describe('dueStatusOf', () => {
    it.each([
      ['2026-09-26', CheckupDueStatus.OVERDUE],
      ['2026-09-27', CheckupDueStatus.DUE_SOON],
      ['2026-09-30', CheckupDueStatus.DUE_SOON],
      ['2026-10-01', CheckupDueStatus.OK],
    ])('classifies due date %s on 2026-09-27 as %s', (dueDate, expected) => {
      expect(dueStatusOf(dueDate, '2026-09-27')).toBe(expected);
    });
  });

  describe('isOverdueNotifiable', () => {
    it('is false at exactly 7 days overdue', () => {
      expect(isOverdueNotifiable('2026-09-20', '2026-09-27')).toBe(false);
    });

    it('is true from 8 days overdue', () => {
      expect(isOverdueNotifiable('2026-09-19', '2026-09-27')).toBe(true);
    });

    it('is false before the due date', () => {
      expect(isOverdueNotifiable('2026-10-01', '2026-09-27')).toBe(false);
    });
  });

  describe('assertVisitExamDate', () => {
    const now = new Date('2026-09-27T10:00:00Z');

    it('accepts an exam up to 7 days ago', () => {
      expect(() =>
        assertVisitExamDate(new Date('2026-09-20T10:00:00Z'), now),
      ).not.toThrow();
    });

    it('rejects an exam in the future', () => {
      expect(() =>
        assertVisitExamDate(new Date('2026-09-27T10:00:01Z'), now),
      ).toThrow(BadRequestException);
    });

    it('rejects an exam backdated more than 7 days', () => {
      expect(() =>
        assertVisitExamDate(new Date('2026-09-20T09:59:59Z'), now),
      ).toThrow(BadRequestException);
    });

    it('rejects a follow-up visit earlier than the case opening', () => {
      expect(() =>
        assertVisitExamDate(
          new Date('2026-09-25T08:00:00Z'),
          now,
          new Date('2026-09-26T08:00:00Z'),
        ),
      ).toThrow(BadRequestException);
    });

    it('accepts a follow-up visit at the case opening time', () => {
      const openedAt = new Date('2026-09-26T08:00:00Z');
      expect(() => assertVisitExamDate(openedAt, now, openedAt)).not.toThrow();
    });
  });

  describe('assertHealthChangeReason', () => {
    it('reports no change without requiring a reason', () => {
      expect(
        assertHealthChangeReason(
          HorseHealthStatus.ELIGIBLE,
          HorseHealthStatus.ELIGIBLE,
          undefined,
        ),
      ).toBe(false);
    });

    it('requires a non-blank reason when the status changes', () => {
      expect(() =>
        assertHealthChangeReason(
          HorseHealthStatus.ELIGIBLE,
          HorseHealthStatus.INJURED,
          '   ',
        ),
      ).toThrow(BadRequestException);
    });

    it('reports a change when a reason is given', () => {
      expect(
        assertHealthChangeReason(
          HorseHealthStatus.ELIGIBLE,
          HorseHealthStatus.INJURED,
          'Viêm gân chân trước',
        ),
      ).toBe(true);
    });
  });

  describe('visits and cases', () => {
    const input = (overrides = {}) => ({
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      initialDiagnosis: undefined,
      requestCount: 0,
      injuryCount: 0,
      hasNextVisit: false,
      ...overrides,
    });
    const now = new Date('2026-09-27T10:00:00Z');

    it('blocks a standalone visit while a case is open', () => {
      expect(() => assertStandaloneVisitAllowed(true)).toThrow(
        ConflictException,
      );
      expect(() => assertStandaloneVisitAllowed(false)).not.toThrow();
    });

    it.each([
      [
        'ISSUE without initial diagnosis',
        { conclusion: MedicalVisitConclusion.ISSUE },
      ],
      ['initial diagnosis on a NORMAL visit', { initialDiagnosis: 'x' }],
      ['REQUEST without request', { kind: MedicalVisitKind.REQUEST }],
      ['injuries on a NORMAL visit', { injuryCount: 1 }],
      ['next visit on a NORMAL visit', { hasNextVisit: true }],
    ])('rejects %s', (_label, overrides) => {
      expect(() => assertStandaloneVisitInput(input(overrides))).toThrow(
        BadRequestException,
      );
    });

    it('accepts an ISSUE visit with diagnosis, injuries and next visit', () => {
      expect(() =>
        assertStandaloneVisitInput(
          input({
            conclusion: MedicalVisitConclusion.ISSUE,
            initialDiagnosis: 'Viêm gân',
            injuryCount: 1,
            hasNextVisit: true,
          }),
        ),
      ).not.toThrow();
    });

    it('rejects a next visit on a past club day', () => {
      expect(() =>
        assertNextVisitAt(new Date('2026-09-26T16:59:59Z'), now),
      ).toThrow(BadRequestException);
    });

    it('accepts a next visit today even at an earlier hour (club calendar)', () => {
      expect(() =>
        assertNextVisitAt(new Date('2026-09-26T17:00:00Z'), now),
      ).not.toThrow();
    });

    it('only attaches pending requests of the same horse', () => {
      const pending = {
        id: 'r1',
        horseId: 'h1',
        status: ExamRequestStatus.PENDING,
      };
      expect(() =>
        assertRequestsAttachable(['r1'], [pending], 'h1'),
      ).not.toThrow();
      expect(() => assertRequestsAttachable(['r1'], [pending], 'h2')).toThrow(
        ConflictException,
      );
      expect(() =>
        assertRequestsAttachable(
          ['r1'],
          [{ ...pending, status: ExamRequestStatus.EXAMINED }],
          'h1',
        ),
      ).toThrow(ConflictException);
      expect(() =>
        assertRequestsAttachable(['r1', 'r2'], [pending], 'h1'),
      ).toThrow(ConflictException);
    });

    it('only replaces a voided visit of the same horse', () => {
      expect(() =>
        assertReplacementTarget({ horseId: 'h1', voidedAt: now }, 'h1'),
      ).not.toThrow();
      expect(() =>
        assertReplacementTarget({ horseId: 'h1', voidedAt: null }, 'h1'),
      ).toThrow(ConflictException);
      expect(() => assertReplacementTarget(null, 'h1')).toThrow(
        ConflictException,
      );
    });

    it('only works on an open case', () => {
      expect(() => assertCaseOpen(MedicalCaseStatus.CLOSED)).toThrow(
        ConflictException,
      );
      expect(() => assertCaseOpen(MedicalCaseStatus.OPEN)).not.toThrow();
    });

    it('decides what voiding a visit does', () => {
      const normal = {
        voidedAt: null,
        conclusion: MedicalVisitConclusion.NORMAL,
      };
      const opening = { ...normal, conclusion: MedicalVisitConclusion.ISSUE };
      const followUp = { ...normal, conclusion: null };
      expect(resolveVisitVoid(normal, null, 0)).toBe(VisitVoidAction.VOID);
      expect(resolveVisitVoid(followUp, MedicalCaseStatus.OPEN, 2)).toBe(
        VisitVoidAction.VOID,
      );
      expect(resolveVisitVoid(followUp, MedicalCaseStatus.CLOSED, 2)).toBe(
        VisitVoidAction.VOID,
      );
      expect(resolveVisitVoid(opening, MedicalCaseStatus.OPEN, 0)).toBe(
        VisitVoidAction.VOID_AND_CANCEL_CASE,
      );
      expect(() =>
        resolveVisitVoid({ ...normal, voidedAt: now }, null, 0),
      ).toThrow(ConflictException);
      expect(() =>
        resolveVisitVoid(opening, MedicalCaseStatus.OPEN, 1),
      ).toThrow(ConflictException);
      expect(() =>
        resolveVisitVoid(opening, MedicalCaseStatus.CLOSED, 0),
      ).toThrow(ConflictException);
    });

    it('resolves the lock decision when closing a case', () => {
      expect(resolveLockOnClose(false, undefined, undefined, now)).toBe('NONE');
      expect(() => resolveLockOnClose(true, undefined, undefined, now)).toThrow(
        BadRequestException,
      );
      expect(
        resolveLockOnClose(true, CaseLockDecision.RELEASE, undefined, now),
      ).toBe(CaseLockDecision.RELEASE);
      expect(() =>
        resolveLockOnClose(true, CaseLockDecision.KEEP, undefined, now),
      ).toThrow(BadRequestException);
      expect(() =>
        resolveLockOnClose(
          true,
          CaseLockDecision.KEEP,
          new Date('2026-09-26T00:00:00Z'),
          now,
        ),
      ).toThrow(BadRequestException);
      expect(
        resolveLockOnClose(
          true,
          CaseLockDecision.KEEP,
          new Date('2026-10-05T00:00:00Z'),
          now,
        ),
      ).toBe(CaseLockDecision.KEEP);
    });

    it('rejects a lock choice when the case closes with a death', () => {
      expect(() =>
        assertNoLockChoiceOnDeath(undefined, undefined),
      ).not.toThrow();
      for (const [decision, expectedEnd, field] of [
        [CaseLockDecision.RELEASE, undefined, 'lockDecision'],
        [undefined, '2026-10-10T00:00:00Z', 'lockExpectedEnd'],
      ] as const) {
        try {
          assertNoLockChoiceOnDeath(decision, expectedEnd);
          fail('expected BadRequestException');
        } catch (error) {
          expect(error).toBeInstanceOf(BadRequestException);
          expect((error as BadRequestException).getResponse()).toMatchObject({
            errors: [{ field }],
          });
        }
      }
    });

    it('only adjusts the cost of a closed case', () => {
      expect(() => assertCostAdjustable(MedicalCaseStatus.OPEN)).toThrow(
        ConflictException,
      );
      expect(() =>
        assertCostAdjustable(MedicalCaseStatus.CLOSED),
      ).not.toThrow();
    });

    it('never shows the cost to a head trainer and never shows dosage to an owner', () => {
      expect(canSeeMedicalCost([UserRole.HEAD_TRAINER])).toBe(false);
      expect(canSeeMedicalCost([UserRole.HORSE_OWNER])).toBe(true);
      expect(canSeeDosage([UserRole.HORSE_OWNER])).toBe(false);
      expect(canSeeDosage([UserRole.HEAD_TRAINER])).toBe(true);
    });
  });

  describe('exam requests', () => {
    const scope = (
      roles: UserRole[],
      isInTrainerBarn = false,
      isAssignedGroom = false,
    ) => ({
      roles,
      isInTrainerBarn,
      isAssignedGroom,
    });

    it('lets veterinarians and club managers request an exam for any horse', () => {
      expect(() =>
        assertCanRequestExam(scope([UserRole.VETERINARIAN])),
      ).not.toThrow();
      expect(() =>
        assertCanRequestExam(scope([UserRole.CLUB_MANAGER])),
      ).not.toThrow();
    });

    it('limits head trainers to their barn and grooms to their horses', () => {
      expect(() =>
        assertCanRequestExam(scope([UserRole.HEAD_TRAINER])),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertCanRequestExam(scope([UserRole.HEAD_TRAINER], true)),
      ).not.toThrow();
      expect(() => assertCanRequestExam(scope([UserRole.GROOM]))).toThrow(
        ForbiddenException,
      );
      expect(() =>
        assertCanRequestExam(scope([UserRole.GROOM], false, true)),
      ).not.toThrow();
      expect(() => assertCanRequestExam(scope([UserRole.HORSE_OWNER]))).toThrow(
        ForbiddenException,
      );
    });

    it('maps the sender role to the request source', () => {
      expect(examRequestSourceFor([UserRole.VETERINARIAN])).toBe(
        ExamRequestSource.VET,
      );
      expect(examRequestSourceFor([UserRole.HEAD_TRAINER])).toBe(
        ExamRequestSource.STAFF,
      );
      expect(examRequestSourceFor([UserRole.CLUB_MANAGER])).toBe(
        ExamRequestSource.STAFF,
      );
      expect(examRequestSourceFor([UserRole.GROOM])).toBe(
        ExamRequestSource.GROOM_INCIDENT,
      );
    });

    it('treats only a fever as urgent', () => {
      expect(isUrgentAlert(HorseMeasurementAlert.FEVER)).toBe(true);
      expect(isUrgentAlert(HorseMeasurementAlert.WEIGHT_DROP)).toBe(false);
    });

    it('only handles pending requests', () => {
      expect(() =>
        assertRequestPending(ExamRequestStatus.PENDING),
      ).not.toThrow();
      expect(() => assertRequestPending(ExamRequestStatus.EXAMINED)).toThrow(
        ConflictException,
      );
      expect(() => assertRequestPending(ExamRequestStatus.DISMISSED)).toThrow(
        ConflictException,
      );
    });
  });

  describe('training locks', () => {
    it('allows a single active lock per horse', () => {
      expect(() => assertNoActiveLock(true)).toThrow(ConflictException);
      expect(() => assertNoActiveLock(false)).not.toThrow();
    });

    it('only releases an active lock', () => {
      expect(() => assertLockActive(TrainingLockStatus.RELEASED)).toThrow(
        ConflictException,
      );
      expect(() => assertLockActive(TrainingLockStatus.ACTIVE)).not.toThrow();
    });

    it('rejects an expected end on a past club day but accepts today', () => {
      const now = new Date('2026-09-27T10:00:00Z');
      expect(() =>
        assertLockEnd(new Date('2026-09-26T16:59:59Z'), now),
      ).toThrow(BadRequestException);
      expect(() =>
        assertLockEnd(new Date('2026-09-27T00:00:00+07:00'), now),
      ).not.toThrow();
      expect(() =>
        assertLockEnd(new Date('2026-10-01T00:00:00Z'), now),
      ).not.toThrow();
    });
  });

  describe('checkups and dashboard', () => {
    it('computes the due state of a horse', () => {
      expect(
        checkupStateOf(
          {
            lastVisitDate: '2026-08-20',
            createdDate: '2026-01-01',
            reactivatedDate: null,
          },
          '2026-09-27',
        ),
      ).toEqual({
        dueDate: '2026-09-19',
        daysLeft: -8,
        dueStatus: CheckupDueStatus.OVERDUE,
      });
    });

    it('validates the appointment date against today and the due date', () => {
      expect(() =>
        assertAppointmentDate('2026-09-26', '2026-09-27', '2026-10-10'),
      ).toThrow(BadRequestException);
      expect(() =>
        assertAppointmentDate('2026-10-11', '2026-09-27', '2026-10-10'),
      ).toThrow(BadRequestException);
      expect(() =>
        assertAppointmentDate('2026-10-10', '2026-09-27', '2026-10-10'),
      ).not.toThrow();
      expect(() =>
        assertAppointmentDate('2026-10-20', '2026-09-27', '2026-09-20'),
      ).not.toThrow();
    });

    it('requires a reason only when rescheduling', () => {
      expect(() => assertRescheduleReason(true, undefined)).toThrow(
        BadRequestException,
      );
      expect(() => assertRescheduleReason(false, undefined)).not.toThrow();
    });

    it('orders health statuses quarantined, injured, observed, eligible', () => {
      const ordered = [
        HorseHealthStatus.ELIGIBLE,
        HorseHealthStatus.INJURED,
        HorseHealthStatus.UNDER_OBSERVATION,
        HorseHealthStatus.QUARANTINED,
      ].sort((a, b) => healthPriority(a) - healthPriority(b));
      expect(ordered).toEqual([
        HorseHealthStatus.QUARANTINED,
        HorseHealthStatus.INJURED,
        HorseHealthStatus.UNDER_OBSERVATION,
        HorseHealthStatus.ELIGIBLE,
      ]);
    });
  });

  describe('care schedules', () => {
    it('only changes a scheduled task', () => {
      expect(() =>
        assertCareScheduleOpen(CareScheduleStatus.SCHEDULED),
      ).not.toThrow();
      expect(() =>
        assertCareScheduleOpen(CareScheduleStatus.COMPLETED),
      ).toThrow(ConflictException);
      expect(() =>
        assertCareScheduleOpen(CareScheduleStatus.CANCELLED),
      ).toThrow(ConflictException);
    });

    it('rejects a due date in the past', () => {
      expect(() => assertCareDueDate('2026-09-26', '2026-09-27')).toThrow(
        BadRequestException,
      );
      expect(() => assertCareDueDate('2026-09-27', '2026-09-27')).not.toThrow();
    });

    it('lets a vet or the assignee complete a task', () => {
      expect(() =>
        assertCanCompleteCareSchedule([UserRole.VETERINARIAN], false),
      ).not.toThrow();
      expect(() =>
        assertCanCompleteCareSchedule([UserRole.GROOM], true),
      ).not.toThrow();
      expect(() =>
        assertCanCompleteCareSchedule([UserRole.GROOM], false),
      ).toThrow(ForbiddenException);
    });
  });

  describe('isGroomOnly', () => {
    it('is true only for a groom without a club-wide reading role', () => {
      expect(isGroomOnly([UserRole.GROOM])).toBe(true);
      expect(isGroomOnly([UserRole.GROOM, UserRole.HEAD_TRAINER])).toBe(false);
      expect(isGroomOnly([UserRole.VETERINARIAN])).toBe(false);
    });
  });

  describe('isGroomOnlyForExamRequests', () => {
    it('keeps a groom who is also a horse owner limited to assigned horses', () => {
      expect(isGroomOnlyForExamRequests([UserRole.GROOM])).toBe(true);
      expect(
        isGroomOnlyForExamRequests([UserRole.GROOM, UserRole.HORSE_OWNER]),
      ).toBe(true);
      expect(
        isGroomOnlyForExamRequests([UserRole.GROOM, UserRole.HEAD_TRAINER]),
      ).toBe(false);
    });
  });
});

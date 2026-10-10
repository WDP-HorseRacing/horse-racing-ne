import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../horses/enums/horse-status.enum';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  assertClassActivatable,
  assertNoHoldingOverlap,
  assertNoOverlappingClassSession,
  findOverlappingHolding,
  sessionWindowsOverlap,
  assertParticipantAbsent,
  assertParticipantComplete,
  assertSessionOperational,
  assertSessionWindowInClass,
  assertTrainableHorse,
  assertTrialVideoEditable,
  TRIAL_VIDEO_EDIT_WINDOW_MS,
  assertHorseEnrollable,
  assertClassOpenForSessions,
  assertSubjectExercise,
  classEndDate,
  eligibilityForSession,
  initialParticipantEligibility,
  totalPlanWeeks,
} from './training.policy';

describe('training policy', () => {
  it('rejects a reference horse', () => {
    expect(() => assertTrainableHorse(true)).toThrow(BadRequestException);
  });

  it('accepts a club horse', () => {
    expect(() => assertTrainableHorse(false)).not.toThrow();
  });

  it('only activates a draft class', () => {
    expect(() =>
      assertClassActivatable(TrainingClassStatus.DRAFT),
    ).not.toThrow();
    expect(() => assertClassActivatable(TrainingClassStatus.ACTIVE)).toThrow(
      ConflictException,
    );
  });

  it('only allows participant operations while a session is executable', () => {
    expect(() =>
      assertSessionOperational(TrainingSessionStatus.SCHEDULED),
    ).not.toThrow();
    expect(() =>
      assertSessionOperational(TrainingSessionStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() => assertSessionOperational(TrainingSessionStatus.DRAFT)).toThrow(
      ConflictException,
    );
    expect(() =>
      assertSessionOperational(TrainingSessionStatus.COMPLETED),
    ).toThrow(ConflictException);
  });

  it.each([
    SessionParticipantStatus.PLANNED,
    SessionParticipantStatus.PRESENT,
    SessionParticipantStatus.READY,
  ])('accepts an absence report from a %s participant', (status) => {
    expect(() => assertParticipantAbsent(status)).not.toThrow();
  });

  it.each([
    SessionParticipantStatus.ONGOING,
    SessionParticipantStatus.COMPLETED,
  ])('rejects an absence report from a %s participant with 409', (status) => {
    expect(() => assertParticipantAbsent(status)).toThrow(ConflictException);
    expect(() => assertParticipantAbsent(status)).toThrow(
      'Chỉ lượt chờ điểm danh, có mặt hoặc sẵn sàng mới được báo vắng',
    );
  });

  it('requires a completed participant before downstream completion', () => {
    expect(() =>
      assertParticipantComplete(SessionParticipantStatus.COMPLETED),
    ).toThrow(ConflictException);
    expect(() =>
      assertParticipantComplete(SessionParticipantStatus.ONGOING),
    ).not.toThrow();
  });

  it('keeps a session window inside the class date range', () => {
    expect(() =>
      assertSessionWindowInClass(
        '2026-09-10T08:00:00.000Z',
        '2026-09-10T09:00:00.000Z',
        '2026-09-01',
        '2026-09-30',
      ),
    ).not.toThrow();
    expect(() =>
      assertSessionWindowInClass(
        '2026-08-31T10:00:00.000Z',
        '2026-08-31T11:00:00.000Z',
        '2026-09-01',
        '2026-09-30',
      ),
    ).toThrow(BadRequestException);
  });

  it('compares session days on the club calendar', () => {
    expect(() =>
      assertSessionWindowInClass(
        '2026-08-31T23:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        '2026-09-01',
        '2026-09-30',
      ),
    ).not.toThrow();
  });
});

describe('initialParticipantEligibility', () => {
  const eligibilityOf = (
    healthStatus: HorseHealthStatus,
    hasActiveTrainingLock = false,
  ) =>
    evaluateEligibility({
      isDeleted: false,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      healthStatus,
      hasActiveTrainingLock,
    });

  it('plans an UNDER_OBSERVATION horse without any ineligibility reason', () => {
    expect(
      initialParticipantEligibility(
        eligibilityOf(HorseHealthStatus.UNDER_OBSERVATION),
        false,
      ),
    ).toEqual({
      status: SessionParticipantStatus.PLANNED,
      ineligibilityReason: null,
    });
  });

  it('cancels by lock when the horse is under an active training lock', () => {
    expect(
      initialParticipantEligibility(
        eligibilityOf(HorseHealthStatus.UNDER_OBSERVATION, true),
        true,
      ),
    ).toEqual({
      status: SessionParticipantStatus.CANCELLED_BY_LOCK,
      ineligibilityReason: 'ACTIVE_TRAINING_LOCK',
    });
  });

  it('marks an injured horse ineligible with the training reason only', () => {
    expect(
      initialParticipantEligibility(
        eligibilityOf(HorseHealthStatus.INJURED),
        false,
      ),
    ).toEqual({
      status: SessionParticipantStatus.INELIGIBLE,
      ineligibilityReason: 'HEALTH_INJURED',
    });
  });
});

describe('assertHorseEnrollable', () => {
  it('accepts an ACTIVE horse', () => {
    expect(() =>
      assertHorseEnrollable(HorseLifecycleStatus.ACTIVE),
    ).not.toThrow();
  });

  it.each([
    [HorseLifecycleStatus.RETIRED, 'Ngựa đã giải nghệ, không học lớp'],
    [HorseLifecycleStatus.TRANSFERRED, 'Ngựa đã chuyển nhượng, không học lớp'],
  ])('rejects a %s horse with 409', (status, message) => {
    expect(() => assertHorseEnrollable(status)).toThrow(
      new ConflictException(message),
    );
  });
});

describe('eligibilityForSession', () => {
  const eligibilityOf = (
    healthStatus: HorseHealthStatus,
    hasActiveTrainingLock = false,
  ) =>
    evaluateEligibility({
      isDeleted: false,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      healthStatus,
      hasActiveTrainingLock,
    });

  it('blocks an UNDER_OBSERVATION horse from a HEAVY session', () => {
    const result = eligibilityForSession(
      eligibilityOf(HorseHealthStatus.UNDER_OBSERVATION),
      TrainingIntensity.HEAVY,
    );

    expect(result.trainingEligible).toBe(false);
    expect(result.trainingReasons).toEqual(['HEALTH_UNDER_OBSERVATION']);
    expect(initialParticipantEligibility(result, false)).toEqual({
      status: SessionParticipantStatus.INELIGIBLE,
      ineligibilityReason: 'HEALTH_UNDER_OBSERVATION',
    });
  });

  it.each([TrainingIntensity.LIGHT, TrainingIntensity.MODERATE])(
    'lets an UNDER_OBSERVATION horse train in a %s session',
    (intensity) => {
      const eligibility = eligibilityOf(HorseHealthStatus.UNDER_OBSERVATION);

      expect(eligibilityForSession(eligibility, intensity)).toBe(eligibility);
    },
  );

  it('lets an ELIGIBLE horse train in a HEAVY session', () => {
    const eligibility = eligibilityOf(HorseHealthStatus.ELIGIBLE);

    expect(eligibilityForSession(eligibility, TrainingIntensity.HEAVY)).toBe(
      eligibility,
    );
  });

  it('keeps the lock reason for a locked UNDER_OBSERVATION horse in a HEAVY session', () => {
    const result = eligibilityForSession(
      eligibilityOf(HorseHealthStatus.UNDER_OBSERVATION, true),
      TrainingIntensity.HEAVY,
    );

    expect(result.trainingEligible).toBe(false);
    expect(result.trainingReasons).toContain('ACTIVE_TRAINING_LOCK');
  });
});

describe('assertSubjectExercise', () => {
  it('accepts a time trial with a distance and a target time', () => {
    expect(() =>
      assertSubjectExercise(TrainingSessionType.TIME_TRIAL, 1200, 75000),
    ).not.toThrow();
  });

  it('rejects a time trial without a distance', () => {
    expect(() =>
      assertSubjectExercise(TrainingSessionType.TIME_TRIAL, 0, null),
    ).toThrow(new BadRequestException('Môn chạy thử phải có cự ly lớn hơn 0'));
  });

  it('accepts a regular subject with zero distance', () => {
    expect(() =>
      assertSubjectExercise(TrainingSessionType.REGULAR, 0, null),
    ).not.toThrow();
  });

  it('rejects a target time on a regular subject', () => {
    expect(() =>
      assertSubjectExercise(TrainingSessionType.REGULAR, 3000, 75000),
    ).toThrow(BadRequestException);
  });
});

describe('plan weeks and class end date', () => {
  it('sums the weeks of every plan subject', () => {
    expect(totalPlanWeeks([{ weeks: 4 }, { weeks: 2 }])).toBe(6);
  });

  it.each([
    ['2026-10-05', 1, '2026-10-11'],
    ['2026-10-05', 6, '2026-11-15'],
    ['2026-12-28', 1, '2027-01-03'],
  ])('ends a class starting %s after %d weeks on %s', (start, weeks, end) => {
    expect(classEndDate(start, weeks)).toBe(end);
  });
});

describe('assertClassOpenForSessions', () => {
  it.each([TrainingClassStatus.DRAFT, TrainingClassStatus.ACTIVE])(
    'accepts a %s class',
    (status) => {
      expect(() => assertClassOpenForSessions(status)).not.toThrow();
    },
  );

  it.each([TrainingClassStatus.COMPLETED, TrainingClassStatus.CANCELLED])(
    'rejects a %s class',
    (status) => {
      expect(() => assertClassOpenForSessions(status)).toThrow(
        ConflictException,
      );
    },
  );
});

describe('session overlap policy', () => {
  const window = (start: string, end: string) => ({
    scheduledStartAt: new Date(start),
    scheduledEndAt: new Date(end),
  });
  const base = window('2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z');

  it('treats windows that only touch at the edge as not overlapping', () => {
    expect(
      sessionWindowsOverlap(
        base,
        window('2026-10-10T02:00:00Z', '2026-10-10T03:00:00Z'),
      ),
    ).toBe(false);
    expect(
      sessionWindowsOverlap(
        base,
        window('2026-10-10T00:00:00Z', '2026-10-10T01:00:00Z'),
      ),
    ).toBe(false);
  });

  it('detects partial and nested overlaps', () => {
    expect(
      sessionWindowsOverlap(
        base,
        window('2026-10-10T01:59:00Z', '2026-10-10T03:00:00Z'),
      ),
    ).toBe(true);
    expect(
      sessionWindowsOverlap(
        base,
        window('2026-10-10T01:15:00Z', '2026-10-10T01:30:00Z'),
      ),
    ).toBe(true);
  });

  it('rejects a class session overlapping another one with the club time of the clash', () => {
    expect(() =>
      assertNoOverlappingClassSession(base, [
        window('2026-10-09T01:00:00Z', '2026-10-09T02:00:00Z'),
        window('2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z'),
      ]),
    ).toThrow(
      new ConflictException(
        'Trùng giờ với buổi tập lúc 08:30 ngày 10/10/2026 của lớp',
      ),
    );
  });

  it('accepts a class session next to the others', () => {
    expect(() =>
      assertNoOverlappingClassSession(base, [
        window('2026-10-10T02:00:00Z', '2026-10-10T03:00:00Z'),
      ]),
    ).not.toThrow();
  });

  it('finds the holding that overlaps a session', () => {
    const holding = {
      ...window('2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z'),
      sessionId: 's2',
      classCode: 'B',
    };
    expect(findOverlappingHolding(base, [holding])).toBe(holding);
    expect(
      findOverlappingHolding(
        window('2026-10-10T02:30:00Z', '2026-10-10T03:00:00Z'),
        [holding],
      ),
    ).toBeUndefined();
  });

  it('rejects enrolling a horse that holds an overlapping session in another class', () => {
    const holding = {
      ...window('2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z'),
      sessionId: 's2',
      classCode: 'B',
    };
    expect(() => assertNoHoldingOverlap('Winx', [base], [holding])).toThrow(
      new ConflictException('Ngựa Winx đã có buổi tập trùng giờ ở lớp B'),
    );
    expect(() => assertNoHoldingOverlap('Winx', [base], [])).not.toThrow();
  });

  describe('assertTrialVideoEditable', () => {
    const endAt = new Date('2026-10-10T02:00:00Z');
    const deadline = new Date(endAt.getTime() + TRIAL_VIDEO_EDIT_WINDOW_MS);

    it('allows editing right up to the 7th day after the scheduled end, inclusive', () => {
      expect(() =>
        assertTrialVideoEditable(
          TrainingSessionStatus.COMPLETED,
          endAt,
          deadline,
        ),
      ).not.toThrow();
    });

    it('rejects one millisecond past the deadline', () => {
      expect(() =>
        assertTrialVideoEditable(
          TrainingSessionStatus.COMPLETED,
          endAt,
          new Date(deadline.getTime() + 1),
        ),
      ).toThrow(new ConflictException('Quá hạn gắn video chạy thử'));
    });

    it('rejects a cancelled session even within the window', () => {
      expect(() =>
        assertTrialVideoEditable(TrainingSessionStatus.CANCELLED, endAt, endAt),
      ).toThrow(
        new ConflictException('Buổi tập đã hủy, không sửa video chạy thử'),
      );
    });
  });
});

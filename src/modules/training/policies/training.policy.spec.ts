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
  assertSessionEditable,
  assertNoHoldingOverlap,
  assertNoOverlappingClassSession,
  assertHeadTrainerFreeForSession,
  assertHeadTrainerFreeForMovedClasses,
  findHorseScheduleClashes,
  findOverlappingHolding,
  horseScheduleClashError,
  horsesClashingWithClass,
  sessionWindowsOverlap,
  findGroomRunClashes,
  assertGroomFreeForRun,
  assertGroomFreeForMovedRuns,
  assertNoGroomRunClashes,
  assertParticipantAbsent,
  assertParticipantActionWindow,
  assertParticipantComplete,
  assertParticipantStop,
  assertSessionOperational,
  assertSessionWindowInClass,
  assertTrainableHorse,
  assertSessionRecordEditable,
  assertHorseEnrollable,
  assertClassOpenForSessions,
  assertSubjectExercise,
  classEndDate,
  classPhaseOn,
  findDailyLoadConflict,
  dailyLoadMessage,
  eligibilityForSession,
  initialParticipantEligibility,
  totalPlanWeeks,
} from './training.policy';
import type { GroomRun } from '../types/training-session.types';

describe('training policy', () => {
  it('rejects a reference horse', () => {
    expect(() => assertTrainableHorse(true)).toThrow(BadRequestException);
  });

  it('accepts a club horse', () => {
    expect(() => assertTrainableHorse(false)).not.toThrow();
  });

  it('edits a scheduled session only before check-in opens, 30 minutes before the start', () => {
    const now = new Date('2026-10-10T01:00:00Z');
    const at = (iso: string, status = TrainingSessionStatus.SCHEDULED) => ({
      status,
      scheduledStartAt: new Date(iso),
    });

    expect(() =>
      assertSessionEditable(at('2026-10-10T01:30:01Z'), now),
    ).not.toThrow();
    for (const session of [
      at('2026-10-10T01:30:00Z'),
      at('2026-10-10T01:00:01Z'),
      at('2026-10-10T02:00:00Z', TrainingSessionStatus.IN_PROGRESS),
      at('2026-10-10T02:00:00Z', TrainingSessionStatus.CANCELLED),
    ]) {
      expect(() => assertSessionEditable(session, now)).toThrow(
        new ConflictException(
          'Chỉ sửa được buổi tập đã lên lịch, trước giờ mở điểm danh (30 phút trước giờ bắt đầu)',
        ),
      );
    }
  });

  it('only allows participant operations while a session is executable', () => {
    expect(() =>
      assertSessionOperational(TrainingSessionStatus.SCHEDULED),
    ).not.toThrow();
    expect(() =>
      assertSessionOperational(TrainingSessionStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      assertSessionOperational(TrainingSessionStatus.COMPLETED),
    ).toThrow(ConflictException);
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

  it('stops only an ongoing participant early', () => {
    expect(() =>
      assertParticipantStop(SessionParticipantStatus.ONGOING),
    ).not.toThrow();
    for (const status of [
      SessionParticipantStatus.READY,
      SessionParticipantStatus.COMPLETED,
      SessionParticipantStatus.STOPPED,
    ]) {
      expect(() => assertParticipantStop(status)).toThrow(
        'Chỉ lượt đang tập mới được dừng sớm',
      );
    }
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

  it.each([TrainingIntensity.HEAVY])(
    'blocks an UNDER_OBSERVATION horse from a %s session',
    (intensity) => {
      const result = eligibilityForSession(
        eligibilityOf(HorseHealthStatus.UNDER_OBSERVATION),
        intensity,
      );

      expect(result.trainingEligible).toBe(false);
      expect(result.trainingReasons).toEqual(['HEALTH_UNDER_OBSERVATION']);
      expect(initialParticipantEligibility(result, false)).toEqual({
        status: SessionParticipantStatus.INELIGIBLE,
        ineligibilityReason: 'HEALTH_UNDER_OBSERVATION',
      });
    },
  );

  it('lets an UNDER_OBSERVATION horse train in a LIGHT session', () => {
    const eligibility = eligibilityOf(HorseHealthStatus.UNDER_OBSERVATION);

    expect(eligibilityForSession(eligibility, TrainingIntensity.LIGHT)).toBe(
      eligibility,
    );
  });

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
  it('accepts an active class', () => {
    expect(() =>
      assertClassOpenForSessions(TrainingClassStatus.ACTIVE),
    ).not.toThrow();
  });

  it.each([TrainingClassStatus.COMPLETED, TrainingClassStatus.CANCELLED])(
    'rejects a %s class',
    (status) => {
      expect(() => assertClassOpenForSessions(status)).toThrow(
        ConflictException,
      );
    },
  );
});

describe('groom run clash policy', () => {
  const run = (
    sessionId: string,
    start: string,
    end: string,
    extra: Partial<GroomRun> = {},
  ): GroomRun => ({
    sessionId,
    status: SessionParticipantStatus.PLANNED,
    sessionStatus: TrainingSessionStatus.SCHEDULED,
    sessionName: sessionId,
    horseName: `Ngựa ${sessionId}`,
    scheduledStartAt: new Date(start),
    scheduledEndAt: new Date(end),
    ...extra,
  });
  const target = run('A', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z');

  it('finds a run of another session whose window intersects', () => {
    const busy = run('B', '2026-10-10T01:30:00Z', '2026-10-10T03:00:00Z');
    expect(findGroomRunClashes([target], [busy])).toEqual([
      { run: target, clash: busy },
    ]);
  });

  it('does not count runs that only touch at the edge or share the session', () => {
    expect(
      findGroomRunClashes(
        [target],
        [
          run('B', '2026-10-10T02:00:00Z', '2026-10-10T03:00:00Z'),
          run('C', '2026-10-10T00:00:00Z', '2026-10-10T01:00:00Z'),
          run('A', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z'),
        ],
      ),
    ).toEqual([]);
  });

  it('ignores cancelled sessions and closed runs on either side', () => {
    const at = ['2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z'] as const;
    const closed = [
      SessionParticipantStatus.COMPLETED,
      SessionParticipantStatus.STOPPED,
      SessionParticipantStatus.ABSENT,
      SessionParticipantStatus.SKIPPED,
      SessionParticipantStatus.INELIGIBLE,
      SessionParticipantStatus.CANCELLED,
      SessionParticipantStatus.CANCELLED_BY_LOCK,
    ].map((status) => run('B', ...at, { status }));
    const cancelled = run('C', ...at, {
      sessionStatus: TrainingSessionStatus.CANCELLED,
    });
    expect(findGroomRunClashes([target], [...closed, cancelled])).toEqual([]);
    expect(findGroomRunClashes([cancelled], [run('B', ...at)])).toEqual([]);
  });

  it('counts runs that are present, ready or ongoing', () => {
    const busy = [
      SessionParticipantStatus.PRESENT,
      SessionParticipantStatus.READY,
      SessionParticipantStatus.ONGOING,
    ].map((status, index) =>
      run(`B${index}`, '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z', {
        status,
      }),
    );
    expect(findGroomRunClashes([target], busy)).toHaveLength(3);
  });

  it('rejects assigning a run with the horse, session and club time of the clash', () => {
    const busy = run('B', '2026-10-10T01:30:00Z', '2026-10-10T03:00:00Z', {
      sessionName: 'Sáng',
      horseName: 'Sấm',
    });
    expect(() => assertGroomFreeForRun(target, [busy])).toThrow(
      new ConflictException(
        'Groom đang dắt ngựa Sấm ở buổi "Sáng" lúc 08:30 ngày 10/10/2026, trùng giờ với lượt này',
      ),
    );
    expect(() => assertGroomFreeForRun(target, [])).not.toThrow();
  });

  it('rejects moving runs and lists every clash', () => {
    const second = run('D', '2026-10-11T01:00:00Z', '2026-10-11T02:00:00Z');
    const busy = [
      run('B', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z'),
      run('E', '2026-10-11T01:30:00Z', '2026-10-11T02:30:00Z'),
    ];
    expect(() => assertGroomFreeForMovedRuns([target, second], busy)).toThrow(
      new ConflictException(
        'Groom mới đang dắt lượt trùng giờ: buổi "A" lúc 08:00 ngày 10/10/2026 trùng lượt ngựa Ngựa B ở buổi "B" lúc 08:00 ngày 10/10/2026; buổi "D" lúc 08:00 ngày 11/10/2026 trùng lượt ngựa Ngựa E ở buổi "E" lúc 08:30 ngày 11/10/2026. Giao lại người dắt các lượt này trước khi đổi Groom',
      ),
    );
    expect(() => assertGroomFreeForMovedRuns([target], [])).not.toThrow();
  });

  it('rejects automatic groom assignment listing each clashing pair', () => {
    const clash = run('B', '2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z', {
      horseName: 'Sấm',
    });
    expect(() =>
      assertNoGroomRunClashes([
        { run: { ...target, horseName: 'Gió' }, clash },
      ]),
    ).toThrow(
      new ConflictException(
        'Người dắt bị trùng giờ: ngựa Gió ở buổi "A" lúc 08:00 ngày 10/10/2026 trùng lượt ngựa Sấm ở buổi "B" lúc 08:30 ngày 10/10/2026. Giao lại người dắt các lượt này trước',
      ),
    );
    expect(() => assertNoGroomRunClashes([])).not.toThrow();
  });
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
      horseId: 'h1',
      sessionId: 's2',
      classCode: 'B',
      intensity: TrainingIntensity.LIGHT,
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
      horseId: 'h1',
      sessionId: 's2',
      classCode: 'B',
      intensity: TrainingIntensity.LIGHT,
    };
    expect(() => assertNoHoldingOverlap('Winx', [base], [holding])).toThrow(
      new ConflictException('Ngựa Winx đã có buổi tập trùng giờ ở lớp B'),
    );
    expect(() => assertNoHoldingOverlap('Winx', [base], [])).not.toThrow();
  });

  describe('horse schedule clashes', () => {
    const busy = (
      horseId: string,
      classCode: string,
      start: string,
      end: string,
    ) => ({
      ...window(start, end),
      horseId,
      sessionId: `${horseId}-${start}`,
      classCode,
      intensity: TrainingIntensity.LIGHT,
    });

    it('lists every clashing horse once with its earliest clash, sorted by name, in club time', () => {
      const clashes = findHorseScheduleClashes(base, [
        busy('h2', 'KD-03', '2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z'),
        busy('h1', 'KD-02', '2026-10-10T01:45:00Z', '2026-10-10T02:00:00Z'),
        busy('h1', 'KD-01', '2026-10-10T00:30:00Z', '2026-10-10T01:15:00Z'),
        busy('h3', 'KD-04', '2026-10-11T01:00:00Z', '2026-10-11T02:00:00Z'),
      ]);

      expect(clashes.map((clash) => [clash.horseId, clash.classCode])).toEqual([
        ['h2', 'KD-03'],
        ['h1', 'KD-01'],
      ]);
      expect(
        horseScheduleClashError(
          clashes,
          new Map([
            ['h1', { name: 'Công Phá', mediaId: null }],
            ['h2', { name: 'Giả Nhân', mediaId: null }],
          ]),
        ),
      ).toEqual(
        new ConflictException(
          'Trùng giờ với lịch của ngựa: Công Phá (lớp KD-01, 07:30 ngày 10/10/2026), Giả Nhân (lớp KD-03, 08:30 ngày 10/10/2026)',
        ),
      );
    });

    it('does not count sessions that only touch the edge', () => {
      expect(
        findHorseScheduleClashes(base, [
          busy('h1', 'KD-01', '2026-10-10T00:00:00Z', '2026-10-10T01:00:00Z'),
          busy('h2', 'KD-02', '2026-10-10T02:00:00Z', '2026-10-10T03:00:00Z'),
        ]),
      ).toEqual([]);
    });

    it('falls back to the horse id when the name is unknown', () => {
      expect(
        horseScheduleClashError(
          [busy('h9', 'KD-01', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z')],
          new Map(),
        ).message,
      ).toBe(
        'Trùng giờ với lịch của ngựa: h9 (lớp KD-01, 08:00 ngày 10/10/2026)',
      );
    });
  });

  describe('horsesClashingWithClass', () => {
    const at = (horseId: string, start: string, end: string) => ({
      ...window(start, end),
      horseId,
      sessionId: `${horseId}-${start}`,
      classCode: 'B',
      intensity: TrainingIntensity.LIGHT,
    });
    const draft = window('2026-10-11T01:00:00Z', '2026-10-11T02:00:00Z');

    it('flags holdings against published sessions and other schedules against the whole schedule', () => {
      const clashing = horsesClashingWithClass(
        [base],
        [base, draft],
        [
          at('held', '2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z'),
          at('heldOnDraft', '2026-10-11T01:30:00Z', '2026-10-11T02:30:00Z'),
        ],
        [at('planned', '2026-10-11T01:30:00Z', '2026-10-11T02:30:00Z')],
      );

      expect([...clashing].sort()).toEqual(['held', 'planned']);
    });

    it('ignores sessions that only touch the edge', () => {
      expect(
        horsesClashingWithClass(
          [base],
          [base],
          [at('h1', '2026-10-10T02:00:00Z', '2026-10-10T03:00:00Z')],
          [at('h2', '2026-10-10T00:00:00Z', '2026-10-10T01:00:00Z')],
        ).size,
      ).toBe(0);
    });
  });

  describe('assertSessionRecordEditable', () => {
    it('allows editing a completed session with no time limit', () => {
      expect(() =>
        assertSessionRecordEditable(TrainingSessionStatus.COMPLETED),
      ).not.toThrow();
    });

    it('rejects a cancelled session', () => {
      expect(() =>
        assertSessionRecordEditable(TrainingSessionStatus.CANCELLED),
      ).toThrow(
        new ConflictException('Buổi tập đã hủy, không sửa kết quả được'),
      );
    });
  });
});

describe('assertParticipantActionWindow', () => {
  const session = {
    scheduledStartAt: new Date('2026-10-12T08:00:00Z'),
    scheduledEndAt: new Date('2026-10-12T09:00:00Z'),
  };
  const thirtyMinutes = 30 * 60 * 1000;
  const at = (iso: string) => new Date(iso);

  it('opens the given time before the start and stays open until the end', () => {
    for (const time of ['2026-10-12T07:30:00Z', '2026-10-12T08:59:59Z']) {
      expect(() =>
        assertParticipantActionWindow(session, thirtyMinutes, at(time)),
      ).not.toThrow();
    }
  });

  it('rejects too early with the opening time in club time', () => {
    expect(() =>
      assertParticipantActionWindow(
        session,
        thirtyMinutes,
        at('2026-10-12T07:29:59Z'),
      ),
    ).toThrow(
      new ConflictException('Chưa tới giờ, mở lúc 14:30 ngày 12/10/2026'),
    );
  });

  it('rejects at or after the end of the session', () => {
    expect(() =>
      assertParticipantActionWindow(
        session,
        thirtyMinutes,
        at('2026-10-12T09:00:00Z'),
      ),
    ).toThrow(
      new ConflictException('Buổi tập đã hết giờ lúc 16:00 ngày 12/10/2026'),
    );
  });
});

describe('classPhaseOn', () => {
  const phases = [
    { position: 2, weeks: 1 },
    { position: 1, weeks: 2 },
  ];

  it('finds the phase containing a day, counting weeks from the class start', () => {
    expect(classPhaseOn('2026-10-05', phases, '2026-10-05')?.position).toBe(1);
    expect(classPhaseOn('2026-10-05', phases, '2026-10-18')?.position).toBe(1);
    expect(classPhaseOn('2026-10-05', phases, '2026-10-19')?.position).toBe(2);
    expect(classPhaseOn('2026-10-05', phases, '2026-10-25')?.position).toBe(2);
  });

  it('returns nothing before the start or after the last phase', () => {
    expect(classPhaseOn('2026-10-05', phases, '2026-10-04')).toBeUndefined();
    expect(classPhaseOn('2026-10-05', phases, '2026-10-26')).toBeUndefined();
  });
});

describe('findDailyLoadConflict', () => {
  const load = (
    start: string,
    end: string,
    intensity = TrainingIntensity.LIGHT,
    classCode = 'K2',
  ) => ({
    sessionId: `${classCode}-${start}`,
    classCode,
    intensity,
    scheduledStartAt: new Date(start),
    scheduledEndAt: new Date(end),
  });
  const session = (
    start: string,
    end: string,
    intensity = TrainingIntensity.LIGHT,
  ) => ({
    scheduledStartAt: new Date(start),
    scheduledEndAt: new Date(end),
    intensity,
  });

  it('needs 3 hours from the end of one session to the start of the other, across midnight', () => {
    const other = load('2026-10-10T14:00:00Z', '2026-10-10T15:00:00Z');

    expect(
      findDailyLoadConflict(
        session('2026-10-10T17:59:00Z', '2026-10-10T19:00:00Z'),
        [other],
      ),
    ).toEqual({ other, reason: 'REST' });
    expect(
      findDailyLoadConflict(
        session('2026-10-10T18:00:00Z', '2026-10-10T19:00:00Z'),
        [other],
      ),
    ).toBeUndefined();
    expect(
      findDailyLoadConflict(
        session('2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z'),
        [other],
      ),
    ).toBeUndefined();
  });

  it('allows two sessions a club day, only one of them HEAVY', () => {
    const morning = load(
      '2026-10-09T23:00:00Z',
      '2026-10-10T00:00:00Z',
      TrainingIntensity.HEAVY,
    );
    const noon = load('2026-10-10T05:00:00Z', '2026-10-10T06:00:00Z');

    expect(
      findDailyLoadConflict(
        session('2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z'),
        [morning, noon],
      ),
    ).toEqual({ other: morning, reason: 'DAY_LIMIT' });
    expect(
      findDailyLoadConflict(
        session(
          '2026-10-10T10:00:00Z',
          '2026-10-10T11:00:00Z',
          TrainingIntensity.HEAVY,
        ),
        [morning],
      ),
    ).toEqual({ other: morning, reason: 'HEAVY_DAY_LIMIT' });
    expect(
      findDailyLoadConflict(
        session('2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z'),
        [morning],
      ),
    ).toBeUndefined();
    expect(
      findDailyLoadConflict(
        session(
          '2026-10-10T18:00:00Z',
          '2026-10-10T19:00:00Z',
          TrainingIntensity.HEAVY,
        ),
        [morning, noon],
      ),
    ).toBeUndefined();
  });

  it('describes each conflict with the class and club time of the other session', () => {
    const other = load('2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z');

    expect(dailyLoadMessage({ other, reason: 'REST' })).toBe(
      'chưa nghỉ đủ 3 giờ so với buổi khác (lớp K2, 08:00 ngày 10/10/2026)',
    );
    expect(dailyLoadMessage({ other, reason: 'DAY_LIMIT' })).toBe(
      'đã đủ 2 buổi trong ngày (lớp K2, 08:00 ngày 10/10/2026)',
    );
    expect(dailyLoadMessage({ other, reason: 'HEAVY_DAY_LIMIT' })).toBe(
      'đã có buổi Nặng trong ngày (lớp K2, 08:00 ngày 10/10/2026)',
    );
  });
});

describe('head trainer schedule policy', () => {
  const htSession = (classCode: string, start: string, end: string) => ({
    sessionId: `s-${classCode}-${start}`,
    classId: `c-${classCode}`,
    classCode,
    headTrainerId: 'ht',
    scheduledStartAt: new Date(start),
    scheduledEndAt: new Date(end),
  });
  const window = {
    scheduledStartAt: new Date('2026-10-10T01:00:00Z'),
    scheduledEndAt: new Date('2026-10-10T02:00:00Z'),
  };

  it('rejects a session overlapping a session of another class of the head trainer, naming the first clash', () => {
    expect(() =>
      assertHeadTrainerFreeForSession(window, [
        htSession('B', '2026-10-10T00:00:00Z', '2026-10-10T01:00:00Z'),
        htSession('C', '2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z'),
        htSession('D', '2026-10-10T01:45:00Z', '2026-10-10T02:15:00Z'),
      ]),
    ).toThrow(
      new ConflictException(
        'Trùng giờ với lịch của Huấn luyện viên trưởng: lớp C, 08:30 ngày 10/10/2026',
      ),
    );
  });

  it('accepts a session touching the head trainer sessions only at the edge', () => {
    expect(() =>
      assertHeadTrainerFreeForSession(window, [
        htSession('B', '2026-10-10T00:00:00Z', '2026-10-10T01:00:00Z'),
        htSession('C', '2026-10-10T02:00:00Z', '2026-10-10T03:00:00Z'),
      ]),
    ).not.toThrow();
    expect(() => assertHeadTrainerFreeForSession(window, [])).not.toThrow();
  });

  it('rejects a handover listing each moved session clashing with the receiver', () => {
    const moving = [
      htSession('A', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z'),
      htSession('A', '2026-10-11T01:00:00Z', '2026-10-11T02:00:00Z'),
    ];
    const busy = [
      htSession('X', '2026-10-10T01:30:00Z', '2026-10-10T02:30:00Z'),
      htSession('Y', '2026-10-11T02:00:00Z', '2026-10-11T03:00:00Z'),
    ];
    expect(() => assertHeadTrainerFreeForMovedClasses(moving, busy)).toThrow(
      new ConflictException(
        'Huấn luyện viên trưởng nhận có buổi trùng giờ: lớp A lúc 08:00 ngày 10/10/2026 trùng lớp X lúc 08:30 ngày 10/10/2026. Đổi giờ các buổi này trước khi bàn giao',
      ),
    );
    expect(() =>
      assertHeadTrainerFreeForMovedClasses(moving, busy.slice(1)),
    ).not.toThrow();
  });
});

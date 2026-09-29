import { EntityManager } from 'typeorm';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingOperationsFacade } from './training-operations.facade';

type Row = Record<string, unknown>;

function buildQueryBuilder(rows: Row[]) {
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

function buildManager(enrollments: Row[], participants: Row[]) {
  const enrollmentQb = buildQueryBuilder(enrollments);
  const participantQb = buildQueryBuilder(participants);
  const getRepository = jest.fn((entity: unknown) => ({
    createQueryBuilder: () =>
      entity === HorseEnrollmentEntity ? enrollmentQb : participantQb,
  }));
  const save = jest.fn((_entity: unknown, rows: unknown) =>
    Promise.resolve(rows),
  );
  const manager = { getRepository, save } as unknown as EntityManager;
  return { manager, enrollmentQb, participantQb, getRepository, save };
}

const AT = new Date('2026-10-01T08:00:00.000Z');

function enrollment(id: string, classId: string, enrolledAt: string): Row {
  return {
    id,
    classId,
    enrolledAt: new Date(enrolledAt),
    leftAt: null,
    status: HorseEnrollmentStatus.ACTIVE,
  };
}

function participant(id: string, sessionId: string): Row {
  return {
    id,
    sessionId,
    status: SessionParticipantStatus.PLANNED,
    cancelReason: null,
  };
}

describe('TrainingOperationsFacade.withdrawHorseFromClasses', () => {
  let facade: TrainingOperationsFacade;
  let refresh: jest.SpyInstance;

  beforeEach(() => {
    facade = new TrainingOperationsFacade();
    refresh = jest
      .spyOn(facade, 'refreshSessionStatus')
      .mockResolvedValue({} as never);
  });

  it('does nothing when the horse has no active enrollment', async () => {
    const { manager, save, getRepository } = buildManager([], []);

    const result = await facade.withdrawHorseFromClasses(manager, 'h1', {
      reason: 'Giải nghệ',
      at: AT,
    });

    expect(result).toEqual({ classIds: [], participantsCancelled: 0 });
    expect(save).not.toHaveBeenCalled();
    expect(getRepository).not.toHaveBeenCalledWith(SessionParticipantEntity);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('locks only the active enrollments of the horse', async () => {
    const { manager, enrollmentQb } = buildManager([], []);

    await facade.withdrawHorseFromClasses(manager, 'h1', {
      reason: 'Giải nghệ',
      at: AT,
    });

    expect(enrollmentQb.where).toHaveBeenCalledWith(
      'enrollment.horse_id = :horseId',
      { horseId: 'h1' },
    );
    expect(enrollmentQb.andWhere).toHaveBeenCalledWith(
      'enrollment.status = :status',
      { status: HorseEnrollmentStatus.ACTIVE },
    );
    expect(enrollmentQb.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
      undefined,
      ['enrollment'],
    );
  });

  it('withdraws from every class when no head trainer is given', async () => {
    const { manager, enrollmentQb } = buildManager([], []);

    await facade.withdrawHorseFromClasses(manager, 'h1', {
      reason: 'Giải nghệ',
      at: AT,
    });

    expect(enrollmentQb.andWhere).not.toHaveBeenCalledWith(
      '(class.head_trainer_id IS NULL OR class.head_trainer_id <> :exceptHeadTrainerId)',
      expect.anything(),
    );
  });

  it('keeps the classes of the given head trainer and withdraws from the others', async () => {
    const { manager, enrollmentQb } = buildManager([], []);

    await facade.withdrawHorseFromClasses(manager, 'h1', {
      reason: 'Đổi khu',
      at: AT,
      exceptHeadTrainerId: 'ht-new',
    });

    expect(enrollmentQb.andWhere).toHaveBeenCalledWith(
      '(class.head_trainer_id IS NULL OR class.head_trainer_id <> :exceptHeadTrainerId)',
      { exceptHeadTrainerId: 'ht-new' },
    );
  });

  it('marks started enrollments LEFT at the given time and cancels their future participants', async () => {
    const enrollments = [
      enrollment('e1', 'c1', '2026-09-01T00:00:00.000Z'),
      enrollment('e2', 'c2', '2026-09-15T00:00:00.000Z'),
    ];
    const participants = [
      participant('p1', 's1'),
      participant('p2', 's1'),
      participant('p3', 's2'),
    ];
    const { manager, save } = buildManager(enrollments, participants);

    const result = await facade.withdrawHorseFromClasses(manager, 'h1', {
      reason: 'Giải nghệ',
      at: AT,
    });

    expect(result).toEqual({
      classIds: ['c1', 'c2'],
      participantsCancelled: 3,
    });
    for (const row of enrollments) {
      expect(row.status).toBe(HorseEnrollmentStatus.LEFT);
      expect(row.leftAt).toBe(AT);
    }
    expect(save).toHaveBeenCalledWith(HorseEnrollmentEntity, enrollments);
    for (const row of participants) {
      expect(row.status).toBe(SessionParticipantStatus.CANCELLED);
      expect(row.cancelReason).toBe('Giải nghệ');
    }
    expect(save).toHaveBeenCalledWith(SessionParticipantEntity, participants);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledWith(manager, 's1');
    expect(refresh).toHaveBeenCalledWith(manager, 's2');
  });

  it('cancels an enrollment that has not started yet instead of leaving it', async () => {
    const future = enrollment('e1', 'c1', '2026-10-05T00:00:00.000Z');
    const { manager } = buildManager([future], []);

    await facade.withdrawHorseFromClasses(manager, 'h1', {
      reason: 'Giải nghệ',
      at: AT,
    });

    expect(future.status).toBe(HorseEnrollmentStatus.CANCELLED);
    expect(future.leftAt).toBeNull();
  });
});

describe('TrainingOperationsFacade.cancelParticipantsFromEnrollments', () => {
  let facade: TrainingOperationsFacade;

  beforeEach(() => {
    facade = new TrainingOperationsFacade();
    jest.spyOn(facade, 'refreshSessionStatus').mockResolvedValue({} as never);
  });

  it('returns 0 without querying when no enrollment is given', async () => {
    const { manager, getRepository } = buildManager([], []);

    await expect(
      facade.cancelParticipantsFromEnrollments(manager, [], AT, 'x'),
    ).resolves.toBe(0);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('only targets open participants of sessions starting from the given time', async () => {
    const { manager, participantQb } = buildManager([], []);

    await facade.cancelParticipantsFromEnrollments(
      manager,
      ['e1', 'e2'],
      AT,
      'x',
    );

    expect(participantQb.where).toHaveBeenCalledWith(
      'participant.horse_enrollment_id IN (:...enrollmentIds)',
      { enrollmentIds: ['e1', 'e2'] },
    );
    expect(participantQb.andWhere).toHaveBeenCalledWith(
      'participant.status IN (:...statuses)',
      {
        statuses: [
          SessionParticipantStatus.PLANNED,
          SessionParticipantStatus.PRESENT,
          SessionParticipantStatus.READY,
        ],
      },
    );
    expect(participantQb.andWhere).toHaveBeenCalledWith(
      'session.scheduled_start_at >= :from',
      { from: AT },
    );
  });
});

describe('TrainingOperationsFacade.moveFutureParticipantsToGroom', () => {
  const facade = new TrainingOperationsFacade();

  it('targets open future participants of the horse assigned to the old groom or to nobody', async () => {
    const { manager, participantQb } = buildManager([], []);

    await facade.moveFutureParticipantsToGroom(
      manager,
      'h1',
      'g-old',
      'g-new',
      AT,
    );

    expect(participantQb.where).toHaveBeenCalledWith(
      'participant.horse_id = :horseId',
      { horseId: 'h1' },
    );
    expect(participantQb.andWhere).toHaveBeenCalledWith(
      '(participant.assigned_groom_id = :fromGroomId OR participant.assigned_groom_id IS NULL)',
      { fromGroomId: 'g-old' },
    );
    expect(participantQb.andWhere).toHaveBeenCalledWith(
      'participant.status IN (:...statuses)',
      {
        statuses: [
          SessionParticipantStatus.PLANNED,
          SessionParticipantStatus.PRESENT,
          SessionParticipantStatus.READY,
        ],
      },
    );
    expect(participantQb.andWhere).toHaveBeenCalledWith(
      'session.scheduled_start_at >= :from',
      { from: AT },
    );
    expect(participantQb.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
      undefined,
      ['participant'],
    );
  });

  it('only fills participants nobody leads when the horse had no groom yet', async () => {
    const { manager, participantQb } = buildManager([], []);

    await facade.moveFutureParticipantsToGroom(
      manager,
      'h1',
      null,
      'g-new',
      AT,
    );

    expect(participantQb.andWhere).toHaveBeenCalledWith(
      'participant.assigned_groom_id IS NULL',
      { fromGroomId: null },
    );
  });

  it('reassigns the found participants to the new groom and returns their ids', async () => {
    const rows = [
      { id: 'p1', assignedGroomId: 'g-old' },
      { id: 'p2', assignedGroomId: 'g-old' },
    ];
    const { manager, save } = buildManager([], rows);

    const moved = await facade.moveFutureParticipantsToGroom(
      manager,
      'h1',
      'g-old',
      'g-new',
      AT,
    );

    expect(moved).toEqual(['p1', 'p2']);
    for (const row of rows) expect(row.assignedGroomId).toBe('g-new');
    expect(save).toHaveBeenCalledWith(SessionParticipantEntity, rows);
  });

  it('saves nothing when no participant matches', async () => {
    const { manager, save } = buildManager([], []);

    await expect(
      facade.moveFutureParticipantsToGroom(manager, 'h1', 'g-old', 'g-new', AT),
    ).resolves.toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('TrainingOperationsFacade.cancelFutureParticipationsByTrainingLock', () => {
  it('uses the same >= cut-off as leaving a class, so a session starting at the lock time is cancelled', async () => {
    const facade = new TrainingOperationsFacade();
    const { manager, participantQb } = buildManager([], []);

    await facade.cancelFutureParticipationsByTrainingLock(
      manager,
      'h1',
      'Khóa huấn luyện',
      AT,
    );

    expect(participantQb.andWhere).toHaveBeenCalledWith(
      'session.scheduled_start_at >= :now',
      { now: AT },
    );
  });
});

describe('TrainingOperationsFacade.refreshSessionStatus', () => {
  const facade = new TrainingOperationsFacade();

  function sessionManager(
    status: TrainingSessionStatus,
    openCount: number,
    happenedCount: number,
  ) {
    const session: Record<string, unknown> = {
      id: 's1',
      status,
      cancelledAt: null,
      cancelReason: null,
    };
    const countBy = jest
      .fn()
      .mockResolvedValueOnce(openCount)
      .mockResolvedValueOnce(happenedCount);
    const save = jest.fn((row: unknown) => Promise.resolve(row));
    const manager = {
      findOne: jest.fn().mockResolvedValue(session),
      countBy,
      save,
    } as unknown as EntityManager;
    return { session, manager, save };
  }

  it('keeps a session with open participants unchanged', async () => {
    const { session, manager, save } = sessionManager(
      TrainingSessionStatus.SCHEDULED,
      1,
      0,
    );
    await facade.refreshSessionStatus(manager, 's1');
    expect(session.status).toBe(TrainingSessionStatus.SCHEDULED);
    expect(save).not.toHaveBeenCalled();
  });

  it('completes a session where at least one participant actually took part', async () => {
    const { session, manager } = sessionManager(
      TrainingSessionStatus.IN_PROGRESS,
      0,
      1,
    );
    await facade.refreshSessionStatus(manager, 's1');
    expect(session.status).toBe(TrainingSessionStatus.COMPLETED);
    expect(session.cancelReason).toBeNull();
  });

  it('cancels a session whose participants were all cancelled, with a reason', async () => {
    const { session, manager, save } = sessionManager(
      TrainingSessionStatus.SCHEDULED,
      0,
      0,
    );
    await facade.refreshSessionStatus(manager, 's1');
    expect(session.status).toBe(TrainingSessionStatus.CANCELLED);
    expect(session.cancelReason).toBe('Không còn ngựa tham gia');
    expect(session.cancelledAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledWith(session);
  });

  it('leaves an already closed session alone', async () => {
    const { session, manager, save } = sessionManager(
      TrainingSessionStatus.COMPLETED,
      0,
      0,
    );
    await facade.refreshSessionStatus(manager, 's1');
    expect(session.status).toBe(TrainingSessionStatus.COMPLETED);
    expect(save).not.toHaveBeenCalled();
  });
});

import { EntityManager } from 'typeorm';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
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
      'class.head_trainer_id = :headTrainerId',
      expect.anything(),
    );
  });

  it('withdraws only from classes of the given head trainer', async () => {
    const { manager, enrollmentQb } = buildManager([], []);

    await facade.withdrawHorseFromClasses(manager, 'h1', {
      reason: 'Đổi khu',
      at: AT,
      headTrainerId: 'ht-old',
    });

    expect(enrollmentQb.andWhere).toHaveBeenCalledWith(
      'class.head_trainer_id = :headTrainerId',
      { headTrainerId: 'ht-old' },
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

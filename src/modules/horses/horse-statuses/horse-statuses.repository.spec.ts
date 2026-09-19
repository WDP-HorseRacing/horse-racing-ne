import { EntityManager, In, IsNull } from 'typeorm';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { RaceStatus } from '../../racing/constants/race-status.enum';
import { RegistrationStatus } from '../../racing/constants/registration-status.enum';
import { StallStatus } from '../../stable/constants/stall-status.enum';
import { StallAssignmentEntity } from '../../stable/entities/stall-assignment.entity';
import { StallEntity } from '../../stable/entities/stall.entity';
import { TrainingPlanStatus } from '../../training/constants/training-plan-status.enum';
import { TrainingSessionStatus } from '../../training/constants/training-session-status.enum';
import { TrainingPlanEntity } from '../../training/entities/training-plan.entity';
import { HorseStatusesRepository } from './horse-statuses.repository';

describe('HorseStatusesRepository.closeActiveStallAssignment', () => {
  let assignments: { findOneBy: jest.Mock; update: jest.Mock };
  let stalls: { update: jest.Mock };
  let getRepository: jest.Mock;
  let manager: EntityManager;
  let repository: HorseStatusesRepository;

  beforeEach(() => {
    assignments = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'a1', stallId: 's1' }),
      update: jest.fn(),
    };
    stalls = { update: jest.fn() };
    getRepository = jest.fn((entity: unknown) =>
      entity === StallAssignmentEntity ? assignments : stalls,
    );
    manager = { getRepository } as unknown as EntityManager;
    repository = new HorseStatusesRepository();
  });

  it('ends the open assignment and sets an occupied stall back to available', async () => {
    const endAt = new Date();
    await repository.closeActiveStallAssignment(manager, 'h1', endAt);
    expect(assignments.findOneBy).toHaveBeenCalledWith({
      horseId: 'h1',
      endAt: IsNull(),
    });
    expect(assignments.update).toHaveBeenCalledWith({ id: 'a1' }, { endAt });
    expect(getRepository).toHaveBeenCalledWith(StallEntity);
    expect(stalls.update).toHaveBeenCalledWith(
      { id: 's1', status: StallStatus.OCCUPIED },
      { status: StallStatus.AVAILABLE },
    );
  });

  it('does nothing when the horse has no stall', async () => {
    assignments.findOneBy.mockResolvedValue(null);
    await repository.closeActiveStallAssignment(manager, 'h1', new Date());
    expect(assignments.update).not.toHaveBeenCalled();
    expect(stalls.update).not.toHaveBeenCalled();
  });
});

describe('HorseStatusesRepository lifecycle clean-up', () => {
  const repository = new HorseStatusesRepository();
  const now = new Date();

  it('cancels open plans and their scheduled sessions', async () => {
    const plans = {
      find: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
      update: jest.fn(),
    };
    const sessions = { update: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === TrainingPlanEntity ? plans : sessions,
      ),
    } as unknown as EntityManager;

    await repository.cancelOpenTrainingPlans(manager, 'h1', 'u1', 'note', now);

    expect(plans.find).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        horseId: 'h1',
        status: In([TrainingPlanStatus.SCHEDULED, TrainingPlanStatus.ACTIVE]),
      },
    });
    expect(sessions.update).toHaveBeenCalledWith(
      { planId: In(['p1', 'p2']), status: TrainingSessionStatus.SCHEDULED },
      {
        status: TrainingSessionStatus.CANCELLED,
        cancelledAt: now,
        cancelledBy: 'u1',
        cancelReason: 'note',
      },
    );
    expect(plans.update).toHaveBeenCalledWith(
      { id: In(['p1', 'p2']) },
      {
        status: TrainingPlanStatus.CANCELLED,
        cancelledAt: now,
        cancelReason: 'note',
      },
    );
  });

  it('skips the updates when the horse has no open plan', async () => {
    const plans = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const manager = {
      getRepository: jest.fn(() => plans),
    } as unknown as EntityManager;

    await repository.cancelOpenTrainingPlans(manager, 'h1', 'u1', 'note', now);

    expect(plans.update).not.toHaveBeenCalled();
  });

  it('releases the active training lock without a veterinarian', async () => {
    const locks = { update: jest.fn() };
    const manager = {
      getRepository: jest.fn(() => locks),
    } as unknown as EntityManager;

    await repository.releaseActiveTrainingLock(manager, 'h1', 'note', now);

    expect(locks.update).toHaveBeenCalledWith(
      { horseId: 'h1', status: TrainingLockStatus.ACTIVE },
      {
        status: TrainingLockStatus.RELEASED,
        releasedBy: null,
        releasedAt: now,
        releaseConclusion: 'note',
      },
    );
  });

  it('withdraws only open registrations of upcoming races', async () => {
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    const manager = {
      createQueryBuilder: jest.fn(() => builder),
    } as unknown as EntityManager;

    await repository.withdrawOpenRegistrations(manager, 'h1');

    expect(builder.set).toHaveBeenCalledWith({
      status: RegistrationStatus.WITHDRAWN,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('status IN (:...open)', {
      open: [
        RegistrationStatus.PROPOSED,
        RegistrationStatus.OWNER_APPROVED,
        RegistrationStatus.MANAGER_CONFIRMED,
      ],
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'race_id IN (SELECT id FROM races WHERE status IN (:...upcoming))',
      { upcoming: [RaceStatus.PLANNED, RaceStatus.OPEN] },
    );
    expect(builder.execute).toHaveBeenCalled();
  });
});

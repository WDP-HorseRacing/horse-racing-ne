import { EntityManager } from 'typeorm';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { completeTrainingClass } from './training-class-completion';

function setup(openSessions = 0) {
  const manager = {
    getRepository: jest.fn(() => ({
      createQueryBuilder: () => {
        const qb = {
          where: () => qb,
          andWhere: () => qb,
          getCount: () => Promise.resolve(openSessions),
        };
        return qb;
      },
    })),
    update: jest.fn(),
    save: jest.fn((row: unknown) => Promise.resolve(row)),
  };
  const audit = { record: jest.fn() };
  return {
    manager,
    audit,
    run: (status: TrainingClassStatus) =>
      completeTrainingClass(
        manager as unknown as EntityManager,
        audit,
        { id: 'c1', status } as TrainingClassEntity,
        null,
        'auto',
      ),
  };
}

describe('completeTrainingClass', () => {
  it('completes the class, lets active horses leave and records the actor and reason', async () => {
    const { manager, audit, run } = setup();

    const saved = await run(TrainingClassStatus.ACTIVE);

    expect(saved.status).toBe(TrainingClassStatus.COMPLETED);
    expect(saved.completedAt).toBeInstanceOf(Date);
    expect(manager.update).toHaveBeenCalledWith(
      HorseEnrollmentEntity,
      { classId: 'c1', status: HorseEnrollmentStatus.ACTIVE },
      { status: HorseEnrollmentStatus.LEFT, leftAt: saved.completedAt },
    );
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actorId: null,
        entityId: 'c1',
        before: { status: TrainingClassStatus.ACTIVE },
        after: { status: TrainingClassStatus.COMPLETED },
        reason: 'auto',
      }),
    );
  });

  it('rejects a class that still has an unfinished session', async () => {
    const { manager, run } = setup(1);

    await expect(run(TrainingClassStatus.ACTIVE)).rejects.toMatchObject({
      status: 409,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a class that is not running', async () => {
    const { manager, run } = setup();

    await expect(run(TrainingClassStatus.CANCELLED)).rejects.toMatchObject({
      status: 409,
    });
    expect(manager.update).not.toHaveBeenCalled();
  });
});

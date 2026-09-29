import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { Actor } from '../../../../common/types/actor';
import { UserRole } from '../../../../common/enums/role.enum';
import { HorseLifecycleStatus } from '../../../horses/enums/horse-status.enum';
import { HorseEnrollmentStatus } from '../../enums/horse-enrollment-status.enum';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
import { SessionParticipantStatus } from '../../enums/session-participant-status.enum';
import { HorseEnrollmentEntity } from '../../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { TrainingAccessService } from '../../shared/training-access.service';
import { TrainingOperationsFacade } from '../../shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from './training-class-enrollments.service';

const actor: Actor = { sub: 'ht', roles: [UserRole.HEAD_TRAINER] };
const LEFT_AT = '2026-10-01T08:00:00.000Z';

function buildEnrollment(status = HorseEnrollmentStatus.ACTIVE) {
  return {
    id: 'e1',
    classId: 'c1',
    horseId: 'h1',
    enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    leftAt: null as Date | null,
    status,
    trainingClass: { headTrainerId: 'ht', endDate: '2026-12-31' },
  };
}

function setup(
  enrollment: ReturnType<typeof buildEnrollment>,
  participants: Array<Record<string, unknown>>,
) {
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(participants),
  };
  const save = jest.fn((...args: unknown[]) =>
    Promise.resolve(args.length === 1 ? args[0] : args[1]),
  );
  const manager = {
    findOne: jest.fn().mockResolvedValue(enrollment),
    save,
    getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)),
  } as unknown as DataSource;
  const access = {
    currentUser: jest.fn().mockResolvedValue({ id: 'ht' }),
    assertCanManageClass: jest.fn(),
    lockedTrainingClass: jest.fn().mockResolvedValue({
      id: 'c1',
      status: TrainingClassStatus.ACTIVE,
      maxHorses: 0,
      headTrainerId: 'ht',
      startDate: '2026-01-01',
      endDate: '2027-12-31',
    }),
    lockedHorse: jest.fn().mockResolvedValue({
      id: 'h1',
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    }),
    assertTrainerBarn: jest.fn(),
  };
  const operations = new TrainingOperationsFacade();
  const refresh = jest
    .spyOn(operations, 'refreshSessionStatus')
    .mockResolvedValue({} as never);
  const service = new TrainingClassEnrollmentsService(
    {} as Repository<HorseEnrollmentEntity>,
    access as unknown as TrainingAccessService,
    operations,
    dataSource,
  );
  return { service, qb, save, access, refresh, manager };
}

describe('TrainingClassEnrollmentsService.leave', () => {
  it('marks the enrollment LEFT and cancels open participants from leftAt', async () => {
    const enrollment = buildEnrollment();
    const participants = [
      {
        id: 'p1',
        sessionId: 's1',
        status: SessionParticipantStatus.PLANNED,
        cancelReason: null,
      },
      {
        id: 'p2',
        sessionId: 's2',
        status: SessionParticipantStatus.READY,
        cancelReason: null,
      },
    ];
    const { service, qb, save, refresh, manager } = setup(
      enrollment,
      participants,
    );

    await service.leave(actor, 'e1', {
      leftAt: LEFT_AT,
      reason: 'Chấn thương',
    });

    expect(enrollment.status).toBe(HorseEnrollmentStatus.LEFT);
    expect(enrollment.leftAt).toEqual(new Date(LEFT_AT));
    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('participant.horse_enrollment_id'),
      expect.objectContaining({}),
    );
    const whereCalls = qb.where.mock.calls as Array<[string, object]>;
    expect(JSON.stringify(whereCalls[0][1])).toContain('e1');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'participant.status IN (:...statuses)',
      {
        statuses: [
          SessionParticipantStatus.PLANNED,
          SessionParticipantStatus.PRESENT,
          SessionParticipantStatus.READY,
        ],
      },
    );
    const andWhereCalls = qb.andWhere.mock.calls as Array<[string, object]>;
    const timeFilter = andWhereCalls.find(([sql]) =>
      sql.startsWith('session.scheduled_start_at >= :'),
    );
    expect(Object.values(timeFilter?.[1] ?? {})).toEqual([new Date(LEFT_AT)]);
    for (const row of participants) {
      expect(row.status).toBe(SessionParticipantStatus.CANCELLED);
      expect(row.cancelReason).toBe('Chấn thương');
    }
    expect(save).toHaveBeenCalledWith(SessionParticipantEntity, participants);
    expect(refresh).toHaveBeenCalledWith(manager, 's1');
    expect(refresh).toHaveBeenCalledWith(manager, 's2');
  });

  it('uses the default reason when none is given', async () => {
    const participants = [
      {
        id: 'p1',
        sessionId: 's1',
        status: SessionParticipantStatus.PLANNED,
        cancelReason: null,
      },
    ];
    const { service } = setup(buildEnrollment(), participants);

    await service.leave(actor, 'e1', { leftAt: LEFT_AT });

    expect(participants[0].cancelReason).toBe('Horse đã rời class');
  });

  it('returns 409 when the enrollment already left the class', async () => {
    const { service, save } = setup(
      buildEnrollment(HorseEnrollmentStatus.LEFT),
      [],
    );

    await expect(
      service.leave(actor, 'e1', { leftAt: LEFT_AT }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns 403 and changes nothing when the caller cannot manage the class', async () => {
    const { service, access, save } = setup(buildEnrollment(), []);
    access.assertCanManageClass.mockImplementation(() => {
      throw new ForbiddenException();
    });

    await expect(
      service.leave(actor, 'e1', { leftAt: LEFT_AT }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('TrainingClassEnrollmentsService.create', () => {
  it.each([HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED])(
    'refuses to enroll a %s horse with 409 and saves nothing',
    async (lifecycleStatus) => {
      const { service, access, save } = setup(buildEnrollment(), []);
      access.lockedHorse.mockResolvedValue({ id: 'h1', lifecycleStatus });

      await expect(
        service.create(actor, 'c1', { horseId: 'h1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(save).not.toHaveBeenCalled();
    },
  );
});

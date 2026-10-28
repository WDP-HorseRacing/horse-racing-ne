import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import type { SessionParticipantEntity } from '../entities/session-participant.entity';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingAccessService } from './training-access.service';

describe('training access service', () => {
  const service = new TrainingAccessService(
    {} as DataSource,
    {} as HorseAccessService,
  );

  it('forbids a club manager from managing a class', () => {
    const actor: Actor = { sub: 'manager', roles: [UserRole.CLUB_MANAGER] };
    expect(() =>
      service.assertCanManageClass(actor, 'manager', 'trainer'),
    ).toThrow(ForbiddenException);
  });

  it('restricts a head trainer to their assigned class', () => {
    const actor: Actor = { sub: 'trainer', roles: [UserRole.HEAD_TRAINER] };
    expect(() =>
      service.assertCanManageClass(actor, 'trainer', 'trainer'),
    ).not.toThrow();
    expect(() =>
      service.assertCanManageClass(actor, 'trainer', 'other-trainer'),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanManageClass(actor, 'trainer', null),
    ).toThrow(ForbiddenException);
  });

  it('hides plan goals from a groom but not from management roles', () => {
    expect(service.seesPlanGoal({ sub: 'groom', roles: [UserRole.GROOM] })).toBe(
      false,
    );
    expect(
      service.seesPlanGoal({
        sub: 'manager',
        roles: [UserRole.CLUB_MANAGER],
      }),
    ).toBe(true);
  });

  describe('runs of the class head trainer', () => {
    const trainer: Actor = { sub: 'kc-ht', roles: [UserRole.HEAD_TRAINER] };
    const manager = {} as EntityManager;
    const isHorseInTrainerBarn = jest.fn().mockResolvedValue(false);
    const assertTrainerBarn = jest
      .fn()
      .mockRejectedValue(
        new ForbiddenException('Ngựa không thuộc khu bạn phụ trách'),
      );
    const withBarnRules = new TrainingAccessService(
      {} as DataSource,
      {
        isHorseInTrainerBarn,
        assertTrainerBarn,
      } as unknown as HorseAccessService,
    );

    const runOf = (
      status: SessionParticipantStatus,
      horse: {
        lifecycleStatus: HorseLifecycleStatus;
        deletedAt: Date | null;
      } | null = {
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        deletedAt: null,
      },
      headTrainerId = 'ht',
    ) =>
      ({
        status,
        horseId: 'horse',
        horse,
        assignedGroomId: null,
        session: { trainingClass: { headTrainerId } },
      }) as unknown as SessionParticipantEntity;

    const record = (participant: SessionParticipantEntity) =>
      withBarnRules.assertCanRecordRunResult(
        manager,
        trainer,
        'ht',
        participant,
      );

    beforeEach(() => jest.clearAllMocks());

    it('lets the class head trainer read a run whatever barn the horse is in now', async () => {
      await expect(
        withBarnRules.canReadParticipant(
          trainer,
          'ht',
          runOf(SessionParticipantStatus.COMPLETED),
          manager,
        ),
      ).resolves.toBe(true);
      expect(isHorseInTrainerBarn).not.toHaveBeenCalled();
    });

    it('lets a head trainer of another class read the run too', async () => {
      await expect(
        withBarnRules.canReadParticipant(
          trainer,
          'ht',
          runOf(SessionParticipantStatus.COMPLETED, undefined, 'other'),
          manager,
        ),
      ).resolves.toBe(true);
      expect(isHorseInTrainerBarn).not.toHaveBeenCalled();
    });

    it('shows a groom only the runs assigned to them', async () => {
      const groom: Actor = { sub: 'kc-groom', roles: [UserRole.GROOM] };
      const assigned = {
        ...runOf(SessionParticipantStatus.COMPLETED),
        assignedGroomId: 'groom',
      } as SessionParticipantEntity;

      await expect(
        withBarnRules.canReadParticipant(groom, 'groom', assigned, manager),
      ).resolves.toBe(true);
      await expect(
        withBarnRules.canReadParticipant(
          groom,
          'groom',
          runOf(SessionParticipantStatus.COMPLETED),
          manager,
        ),
      ).resolves.toBe(false);
    });

    it.each([
      SessionParticipantStatus.COMPLETED,
      SessionParticipantStatus.STOPPED,
    ])(
      'lets the class head trainer record results on a %s run without the barn check',
      async (status) => {
        await expect(record(runOf(status))).resolves.toBeUndefined();
        expect(assertTrainerBarn).not.toHaveBeenCalled();
      },
    );

    it('keeps the barn check on a run still ONGOING', async () => {
      await expect(
        record(runOf(SessionParticipantStatus.ONGOING)),
      ).rejects.toThrow(ForbiddenException);
      expect(assertTrainerBarn).toHaveBeenCalledWith(
        manager,
        trainer,
        'ht',
        'horse',
      );
    });

    it('rejects a head trainer of another class on a finished run (403)', async () => {
      await expect(
        record(runOf(SessionParticipantStatus.COMPLETED, undefined, 'other')),
      ).rejects.toThrow(
        new ForbiddenException(
          'Lượt tập thuộc lớp của Huấn luyện viên trưởng khác',
        ),
      );
    });

    it.each([
      [
        HorseLifecycleStatus.TRANSFERRED,
        'Ngựa đã chuyển nhượng, hồ sơ chỉ được xem',
      ],
      [HorseLifecycleStatus.DECEASED, 'Ngựa đã mất, hồ sơ chỉ được xem'],
    ])(
      'blocks writes on a finished run of a %s horse (409)',
      async (lifecycleStatus, message) => {
        await expect(
          record(
            runOf(SessionParticipantStatus.COMPLETED, {
              lifecycleStatus,
              deletedAt: null,
            }),
          ),
        ).rejects.toThrow(new ConflictException(message));
      },
    );

    it('answers 404 on a finished run whose horse record was deleted', async () => {
      await expect(
        record(runOf(SessionParticipantStatus.COMPLETED, null)),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

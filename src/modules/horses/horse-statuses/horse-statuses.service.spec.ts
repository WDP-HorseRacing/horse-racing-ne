import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { clubToday } from '../../../common/utils/club-date';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import {
  OPEN_CASE_BLOCKS_DECEASED_MESSAGE,
  OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
} from '../../medical/constants/medical.constants';
import { MedicalLifecycleService } from '../../medical/shared/medical-lifecycle.service';
import { TrainingLockService } from '../../medical/training-locks/training-locks.service';
import { GroomAssignmentsService } from '../../stable/groom-assignments/groom-assignments.service';
import { StallsService } from '../../stable/stalls/stalls.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from '../entities/horse.entity';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { HorseAccessService } from '../shared/horse-access.service';
import type { LifecycleImpactRow } from '../types/horse.types';
import {
  HORSE_DECEASED_EVENT,
  HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT,
  HORSE_LIFECYCLE_CHANGED_EVENT,
} from '../constants/horse.constants';
import { HorseStatusesService } from './horse-statuses.service';

type HorseRow = Partial<HorseEntity> & { id: string };

const anyString: unknown = expect.any(String);
const anyDate: unknown = expect.any(Date);
const HORSE_ID = 'h1';
const CALLER_ID = 'cm-1';

describe('HorseStatusesService', () => {
  let ownerships: {
    recordOwnerChange: jest.Mock;
    currentOwnerSince: jest.Mock;
    periodsOfHorse: jest.Mock;
  };

  let horse: HorseRow;
  let impact: LifecycleImpactRow;
  let horseRepository: { update: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let dataSource: { manager: typeof manager; transaction: jest.Mock };
  let statuses: {
    lifecycleImpact: jest.Mock;
  };
  let training: {
    withdrawHorseFromClasses: jest.Mock;
    hasOnSiteParticipant: jest.Mock;
    cancelUnfinishedParticipants: jest.Mock;
    lockHorseSessions: jest.Mock;
    lockHorseEnrollments: jest.Mock;
  };
  let access: {
    currentUser: jest.Mock;
    lockWritableHorse: jest.Mock;
    findNotDeletedHorse: jest.Mock;
    findWritableHorse: jest.Mock;
    hasActiveTrainingLock: jest.Mock;
    lockOwnerAccount: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let stalls: {
    lockOpenStallOfHorse: jest.Mock;
    closeOpenStallAssignment: jest.Mock;
  };
  let grooms: { endOpenGroomAssignment: jest.Mock };
  let trainingLocks: { releaseActiveLockByHorse: jest.Mock };
  let medicalLifecycle: {
    settleBeforeReadOnly: jest.Mock;
    readOnlyBlockReason: jest.Mock;
    readOnlyImpact: jest.Mock;
  };
  let incidentWrites: { closeOpenIncidentsByHorse: jest.Mock };
  let stableLifecycle: {
    settleBeforeReadOnly: jest.Mock;
    readOnlyImpact: jest.Mock;
  };
  let racing: { withdrawOpenRegistrationsByHorse: jest.Mock };
  let events: { publish: jest.Mock };
  let service: HorseStatusesService;

  const actor: Actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };

  const sideEffectMocks = () => [
    training.withdrawHorseFromClasses,
    racing.withdrawOpenRegistrationsByHorse,
    stalls.closeOpenStallAssignment,
    grooms.endOpenGroomAssignment,
    trainingLocks.releaseActiveLockByHorse,
    medicalLifecycle.settleBeforeReadOnly,
    incidentWrites.closeOpenIncidentsByHorse,
    stableLifecycle.settleBeforeReadOnly,
  ];

  const expectNoWrite = () => {
    for (const mock of sideEffectMocks()) {
      expect(mock).not.toHaveBeenCalled();
    }
    expect(horseRepository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    ownerships = {
      recordOwnerChange: jest.fn().mockResolvedValue(undefined),
      currentOwnerSince: jest.fn().mockResolvedValue(null),
      periodsOfHorse: jest.fn().mockResolvedValue([]),
    };
    horse = {
      id: HORSE_ID,
      name: 'Winx',
      ownerId: 'owner-1',
      barnId: 'b1',
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      lifecycleReason: null,
      healthStatus: HorseHealthStatus.ELIGIBLE,
    };
    impact = {
      activeClasses: 2,
      openRaceRegistrations: 3,
      stallCode: 'A-01',
      groomName: 'Groom A',
      barnName: 'Khu A',
      hasActiveTrainingLock: true,
      ownerName: null,
      examRequestsToDismiss: 0,
      careSchedulesToCancel: 0,
      openIncidents: 0,
      feedingPlansToArchive: 0,
      draftFeedingPlansToDelete: 0,
      careTasksToEnd: 0,
      careTasksToDelete: 0,
      checklistToCancel: false,
    };
    horseRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    manager = { getRepository: jest.fn(() => horseRepository) };
    dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    statuses = {
      lifecycleImpact: jest.fn(() => Promise.resolve(impact)),
    };
    training = {
      withdrawHorseFromClasses: jest.fn().mockResolvedValue({
        classIds: ['c1', 'c2'],
        participantsCancelled: 5,
      }),
      hasOnSiteParticipant: jest.fn().mockResolvedValue(false),
      cancelUnfinishedParticipants: jest.fn().mockResolvedValue(0),
      lockHorseSessions: jest.fn().mockResolvedValue(undefined),
      lockHorseEnrollments: jest.fn().mockResolvedValue(undefined),
    };
    access = {
      currentUser: jest.fn().mockResolvedValue({ id: CALLER_ID }),
      lockWritableHorse: jest.fn(() => Promise.resolve(horse)),
      findNotDeletedHorse: jest.fn(() => Promise.resolve(horse)),
      findWritableHorse: jest.fn(() => Promise.resolve(horse)),
      hasActiveTrainingLock: jest.fn().mockResolvedValue(false),
      lockOwnerAccount: jest.fn().mockResolvedValue({
        role: UserRole.HORSE_OWNER,
        status: UserStatus.ACTIVE,
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    stalls = {
      lockOpenStallOfHorse: jest.fn().mockResolvedValue(undefined),
      closeOpenStallAssignment: jest
        .fn()
        .mockResolvedValue({ stallId: 's1', stallCode: 'A-01' }),
    };
    grooms = { endOpenGroomAssignment: jest.fn().mockResolvedValue('g1') };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    trainingLocks = {
      releaseActiveLockByHorse: jest.fn().mockResolvedValue(true),
    };
    medicalLifecycle = {
      settleBeforeReadOnly: jest.fn().mockResolvedValue({
        examRequestsDismissed: 0,
        careSchedulesCancelled: 0,
      }),
      readOnlyBlockReason: jest.fn().mockResolvedValue(null),
      readOnlyImpact: jest.fn(() =>
        Promise.resolve({
          examRequestsToDismiss: impact.examRequestsToDismiss,
          careSchedulesToCancel: impact.careSchedulesToCancel,
        }),
      ),
    };
    incidentWrites = {
      closeOpenIncidentsByHorse: jest.fn().mockResolvedValue(0),
    };
    stableLifecycle = {
      settleBeforeReadOnly: jest.fn().mockResolvedValue({
        feedingPlansArchived: 0,
        draftFeedingPlansDeleted: 0,
        careTasksEnded: 0,
        careTasksDeleted: 0,
        checklistCancelled: false,
      }),
      readOnlyImpact: jest.fn(() =>
        Promise.resolve({
          feedingPlansToArchive: impact.feedingPlansToArchive,
          draftFeedingPlansToDelete: impact.draftFeedingPlansToDelete,
          careTasksToEnd: impact.careTasksToEnd,
          careTasksToDelete: impact.careTasksToDelete,
          checklistToCancel: impact.checklistToCancel,
        }),
      ),
    };
    racing = {
      withdrawOpenRegistrationsByHorse: jest.fn().mockResolvedValue(3),
    };
    service = new HorseStatusesService(
      statuses,
      access as unknown as HorseAccessService,
      dataSource as unknown as DataSource,
      audit,
      stalls as unknown as StallsService,
      grooms as unknown as GroomAssignmentsService,
      trainingLocks as unknown as TrainingLockService,
      medicalLifecycle as unknown as MedicalLifecycleService,
      incidentWrites,
      stableLifecycle,
      racing,
      events,
      training as unknown as TrainingOperationsFacade,
      ownerships,
    );
  });

  describe('updateLifecycle', () => {
    const change = (
      lifecycleStatus: HorseLifecycleStatus,
      reason = 'Bán',
      extra: { ownerId?: string } = {},
    ) =>
      service.updateLifecycle(actor, HORSE_ID, {
        lifecycleStatus,
        reason,
        ...extra,
      });

    it('writes the released groom event to the outbox inside the transfer transaction', async () => {
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT,
        { eventId: anyString, horseId: HORSE_ID, groomId: 'g1' },
      );
      expect(events.publish.mock.invocationCallOrder[0]).toBeGreaterThan(
        horseRepository.update.mock.invocationCallOrder[0],
      );
    });

    it('fails the transfer when the outbox write fails', async () => {
      events.publish.mockRejectedValueOnce(new Error('outbox down'));
      await expect(change(HorseLifecycleStatus.TRANSFERRED)).rejects.toThrow(
        'outbox down',
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        HORSE_LIFECYCLE_CHANGED_EVENT,
        expect.anything(),
      );
    });

    it('tells no groom when the transferred horse had none', async () => {
      grooms.endOpenGroomAssignment.mockResolvedValue(null);
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(events.publish).not.toHaveBeenCalledWith(
        manager,
        HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT,
        expect.anything(),
      );
    });

    it('tells no groom on retirement because the groom stays, but tells the owner the new lifecycle', async () => {
      await change(HorseLifecycleStatus.RETIRED);
      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        HORSE_LIFECYCLE_CHANGED_EVENT,
        expect.objectContaining({
          horseId: HORSE_ID,
          from: HorseLifecycleStatus.ACTIVE,
          to: HorseLifecycleStatus.RETIRED,
          ownerId: 'owner-1',
          withdrawnClassIds: ['c1', 'c2'],
        }),
      );
    });

    it('puts no withdrawn class into the lifecycle event when the change withdraws none', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await change(HorseLifecycleStatus.ACTIVE, 'Trở lại');
      expect(training.withdrawHorseFromClasses).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        HORSE_LIFECYCLE_CHANGED_EVENT,
        expect.objectContaining({ withdrawnClassIds: [] }),
      );
    });

    it('puts the owner whose ownership the sale ends into the lifecycle event', async () => {
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        HORSE_LIFECYCLE_CHANGED_EVENT,
        expect.objectContaining({
          to: HorseLifecycleStatus.TRANSFERRED,
          ownerId: 'owner-1',
        }),
      );
    });

    describe('recording a death', () => {
      const recordDeath = (reason = 'Đau bụng cấp') =>
        service.updateLifecycle(actor, HORSE_ID, {
          lifecycleStatus: HorseLifecycleStatus.DECEASED,
          reason,
        });

      it('cleans up like a transfer and stores today as the date of death', async () => {
        await recordDeath();
        expect(medicalLifecycle.settleBeforeReadOnly).toHaveBeenCalledWith(
          manager,
          HORSE_ID,
          HorseLifecycleStatus.DECEASED,
        );
        expect(training.withdrawHorseFromClasses).toHaveBeenCalledWith(
          manager,
          HORSE_ID,
          { reason: 'Ngựa mất: Đau bụng cấp', at: anyDate },
        );
        expect(racing.withdrawOpenRegistrationsByHorse).toHaveBeenCalled();
        expect(stalls.closeOpenStallAssignment).toHaveBeenCalled();
        expect(grooms.endOpenGroomAssignment).toHaveBeenCalled();
        expect(trainingLocks.releaseActiveLockByHorse).toHaveBeenCalledWith(
          manager,
          HORSE_ID,
          'Gỡ do ngựa mất',
        );
        expect(incidentWrites.closeOpenIncidentsByHorse).toHaveBeenCalledWith(
          manager,
          HORSE_ID,
          'Ngựa đã mất',
        );
        expect(horseRepository.update).toHaveBeenCalledWith(
          { id: HORSE_ID },
          expect.objectContaining({
            lifecycleStatus: HorseLifecycleStatus.DECEASED,
            dateOfDeath: clubToday(),
            barnId: null,
          }),
        );
        const [[, updated]] = horseRepository.update.mock.calls as [
          [unknown, object],
        ];
        expect(updated).not.toHaveProperty('healthStatus');
        expect(updated).not.toHaveProperty('ownerId');
      });

      it('writes one deceased event with the barn and groom before cleanup', async () => {
        await recordDeath();
        expect(events.publish).toHaveBeenCalledTimes(1);
        expect(events.publish).toHaveBeenCalledWith(
          manager,
          HORSE_DECEASED_EVENT,
          {
            eventId: anyString,
            horseId: HORSE_ID,
            barnId: 'b1',
            groomId: 'g1',
            dateOfDeath: clubToday(),
            reason: 'Đau bụng cấp',
            withdrawnClassIds: ['c1', 'c2'],
          },
        );
      });

      it('accepts a retired horse', async () => {
        horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
        await recordDeath();
        expect(horseRepository.update).toHaveBeenCalled();
      });

      it('does not set a date of death on another status', async () => {
        await service.updateLifecycle(actor, HORSE_ID, {
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
          reason: 'Già',
        });
        const [[, updated]] = horseRepository.update.mock.calls as [
          [unknown, object],
        ];
        expect(updated).not.toHaveProperty('dateOfDeath');
      });

      it('rejects a transferred horse with 409', async () => {
        horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
        await expect(recordDeath()).rejects.toThrow(
          new ConflictException(
            'Không thể chuyển vòng đời từ Đã chuyển nhượng sang Đã mất',
          ),
        );
        expectNoWrite();
      });

      it('blocks every lifecycle change of a deceased horse with 409', async () => {
        horse.lifecycleStatus = HorseLifecycleStatus.DECEASED;
        await expect(change(HorseLifecycleStatus.ACTIVE)).rejects.toThrow(
          new ConflictException('Ngựa đã mất, hồ sơ chỉ được xem'),
        );
        expectNoWrite();
      });

      it('blocks while the horse has an open medical case and writes nothing else', async () => {
        medicalLifecycle.settleBeforeReadOnly.mockRejectedValue(
          new ConflictException(OPEN_CASE_BLOCKS_DECEASED_MESSAGE),
        );
        await expect(recordDeath()).rejects.toThrow(
          new ConflictException(OPEN_CASE_BLOCKS_DECEASED_MESSAGE),
        );
        expect(horseRepository.update).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
      });
    });

    it('runs every transfer effect from ACTIVE with the transaction manager', async () => {
      await change(HorseLifecycleStatus.TRANSFERRED, 'Bán cho CLB khác');
      expect(training.withdrawHorseFromClasses).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        { reason: 'Ngựa chuyển nhượng: Bán cho CLB khác', at: anyDate },
      );
      expect(racing.withdrawOpenRegistrationsByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(stalls.closeOpenStallAssignment).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(grooms.endOpenGroomAssignment).toHaveBeenCalledWith(manager, HORSE_ID);
      expect(trainingLocks.releaseActiveLockByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        'Gỡ do chuyển nhượng',
      );
    });

    it('sets the chosen active owner when reactivating a transfer, opens its ownership and audits it', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      horse.ownerId = null;
      await change(HorseLifecycleStatus.ACTIVE, 'Mua lại', {
        ownerId: 'owner-2',
      });
      expect(access.lockOwnerAccount).toHaveBeenCalledWith(manager, 'owner-2');
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID },
        expect.objectContaining({ ownerId: 'owner-2' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: expect.objectContaining({ ownerId: null }) as unknown,
          after: expect.objectContaining({ ownerId: 'owner-2' }) as unknown,
        }),
      );
      expect(ownerships.recordOwnerChange).toHaveBeenCalledWith(manager, {
        horseId: HORSE_ID,
        ownerId: 'owner-2',
        at: anyDate,
        reason: 'Mua lại',
        recordedBy: CALLER_ID,
      });
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        HORSE_LIFECYCLE_CHANGED_EVENT,
        expect.objectContaining({ ownerId: 'owner-2' }),
      );
    });

    it('requires an owner to reactivate a transfer, refuses one elsewhere, and refuses an inactive owner', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(
        change(HorseLifecycleStatus.ACTIVE, 'Mua lại'),
      ).rejects.toBeInstanceOf(BadRequestException);
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await expect(
        change(HorseLifecycleStatus.ACTIVE, 'Trở lại', { ownerId: 'owner-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      access.lockOwnerAccount.mockResolvedValue({
        role: UserRole.HORSE_OWNER,
        status: UserStatus.INACTIVE,
      });
      await expect(
        change(HorseLifecycleStatus.ACTIVE, 'Mua lại', { ownerId: 'owner-2' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(horseRepository.update).not.toHaveBeenCalled();
    });

    it('keeps the owner when reactivating a RETIRED horse', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await change(HorseLifecycleStatus.ACTIVE, 'Trở lại');
      expect(access.lockOwnerAccount).not.toHaveBeenCalled();
      expect(ownerships.recordOwnerChange).not.toHaveBeenCalled();
    });

    it('clears the barn and ends the ownership on transfer', async () => {
      await change(HorseLifecycleStatus.TRANSFERRED, 'Bán cho CLB khác');
      expect(horseRepository.update).toHaveBeenCalledTimes(1);
      const [criteria, changes] = horseRepository.update.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(criteria).toEqual({ id: HORSE_ID });
      expect(changes).toEqual({
        lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
        lifecycleReason: 'Bán cho CLB khác',
        lifecycleChangedAt: expect.any(Date) as unknown,
        barnId: null,
        ownerId: null,
      });
      expect(ownerships.recordOwnerChange).toHaveBeenCalledWith(manager, {
        horseId: HORSE_ID,
        ownerId: null,
        at: anyDate,
        reason: 'Bán cho CLB khác',
        recordedBy: CALLER_ID,
      });
    });

    it('audits the transfer with the reason and feature F1.8', async () => {
      await change(HorseLifecycleStatus.TRANSFERRED, 'Bán cho CLB khác');
      expect(audit.record).toHaveBeenCalledWith(manager, {
        actorId: CALLER_ID,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE,
        entityId: HORSE_ID,
        before: {
          lifecycleStatus: HorseLifecycleStatus.ACTIVE,
          lifecycleReason: null,
          barnId: 'b1',
          ownerId: 'owner-1',
          stallCode: 'A-01',
          groomId: 'g1',
        },
        after: {
          lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
          lifecycleReason: 'Bán cho CLB khác',
          barnId: null,
          classesWithdrawn: 2,
          ownerId: null,
          stallCode: null,
          groomId: null,
          trainingLockReleased: true,
          examRequestsDismissed: 0,
          careSchedulesCancelled: 0,
          incidentsClosed: 0,
          raceRegistrationsWithdrawn: 3,
        },
        reason: 'Bán cho CLB khác',
        feature: 'HORSE_LIFECYCLE',
      });
    });

    it('audits only the transfer effects that actually happened', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      stalls.closeOpenStallAssignment.mockResolvedValue(null);
      grooms.endOpenGroomAssignment.mockResolvedValue(null);
      trainingLocks.releaseActiveLockByHorse.mockResolvedValue(false);
      await change(HorseLifecycleStatus.TRANSFERRED, 'Bán');
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: {
            lifecycleStatus: HorseLifecycleStatus.RETIRED,
            lifecycleReason: null,
            barnId: 'b1',
            ownerId: 'owner-1',
          },
          after: {
            lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
            lifecycleReason: 'Bán',
            barnId: null,
            classesWithdrawn: 2,
            ownerId: null,
            trainingLockReleased: false,
            examRequestsDismissed: 0,
            careSchedulesCancelled: 0,
            incidentsClosed: 0,
          },
        }),
      );
    });

    it('audits the withdrawn race registrations when retiring', async () => {
      racing.withdrawOpenRegistrationsByHorse.mockResolvedValue(2);
      await change(HorseLifecycleStatus.RETIRED, 'Chấn thương');
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: {
            lifecycleStatus: HorseLifecycleStatus.ACTIVE,
            lifecycleReason: null,
          },
          after: {
            lifecycleStatus: HorseLifecycleStatus.RETIRED,
            lifecycleReason: 'Chấn thương',
            classesWithdrawn: 2,
            raceRegistrationsWithdrawn: 2,
          },
        }),
      );
    });

    it('transfers a RETIRED horse withdrawing its classes but not its registrations', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(training.withdrawHorseFromClasses).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        { reason: 'Ngựa chuyển nhượng: Bán', at: anyDate },
      );
      expect(racing.withdrawOpenRegistrationsByHorse).not.toHaveBeenCalled();
      expect(stalls.closeOpenStallAssignment).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(grooms.endOpenGroomAssignment).toHaveBeenCalledWith(manager, HORSE_ID);
      expect(trainingLocks.releaseActiveLockByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        'Gỡ do chuyển nhượng',
      );
    });

    it('retires an ACTIVE horse keeping barn, stall, groom and training lock', async () => {
      await change(HorseLifecycleStatus.RETIRED, 'Chấn thương dài hạn');
      expect(training.withdrawHorseFromClasses).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        { reason: 'Ngựa giải nghệ: Chấn thương dài hạn', at: anyDate },
      );
      expect(racing.withdrawOpenRegistrationsByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(stalls.closeOpenStallAssignment).not.toHaveBeenCalled();
      expect(grooms.endOpenGroomAssignment).not.toHaveBeenCalled();
      expect(trainingLocks.releaseActiveLockByHorse).not.toHaveBeenCalled();
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID },
        {
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
          lifecycleReason: 'Chấn thương dài hạn',
          lifecycleChangedAt: expect.any(Date) as unknown,
        },
      );
    });

    it('keeps the health of a RETIRED horse coming back to ACTIVE', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await change(HorseLifecycleStatus.ACTIVE, 'Quay lại tập luyện');
      const [, changes] = horseRepository.update.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(changes).toMatchObject({
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      });
      expect(changes).not.toHaveProperty('healthStatus');
    });

    it.each([HorseLifecycleStatus.TRANSFERRED])(
      'quarantines the horse when reactivating from %s',
      async (from) => {
        horse.lifecycleStatus = from;
        await change(HorseLifecycleStatus.ACTIVE, 'Quay lại thi đấu', {
          ownerId: 'owner-2',
        });
        expect(horseRepository.update).toHaveBeenCalledWith(
          { id: HORSE_ID },
          expect.objectContaining({
            lifecycleStatus: HorseLifecycleStatus.ACTIVE,
            healthStatus: HorseHealthStatus.QUARANTINED,
          }),
        );
        expect(audit.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            before: expect.objectContaining({
              healthStatus: HorseHealthStatus.ELIGIBLE,
            }) as unknown,
            after: expect.objectContaining({
              healthStatus: HorseHealthStatus.QUARANTINED,
            }) as unknown,
            reason: 'Quay lại thi đấu',
            feature: 'HORSE_LIFECYCLE',
          }),
        );
        for (const mock of sideEffectMocks()) {
          expect(mock).not.toHaveBeenCalled();
        }
      },
    );

    it('blocks transferring a horse with an open medical case with 409 and writes nothing', async () => {
      medicalLifecycle.settleBeforeReadOnly.mockRejectedValue(
        new ConflictException(OPEN_CASE_BLOCKS_TRANSFER_MESSAGE),
      );
      await expect(change(HorseLifecycleStatus.TRANSFERRED)).rejects.toThrow(
        new ConflictException(OPEN_CASE_BLOCKS_TRANSFER_MESSAGE),
      );
      expect(medicalLifecycle.settleBeforeReadOnly).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        HorseLifecycleStatus.TRANSFERRED,
      );
      for (const mock of sideEffectMocks()) {
        if (mock !== medicalLifecycle.settleBeforeReadOnly) {
          expect(mock).not.toHaveBeenCalled();
        }
      }
      expect(horseRepository.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('audits the medical follow-ups closed by the transfer', async () => {
      medicalLifecycle.settleBeforeReadOnly.mockResolvedValue({
        examRequestsDismissed: 2,
        careSchedulesCancelled: 1,
      });
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          after: expect.objectContaining({
            examRequestsDismissed: 2,
            careSchedulesCancelled: 1,
          }) as unknown,
        }),
      );
    });

    it('does not settle medical work when retiring', async () => {
      await change(HorseLifecycleStatus.RETIRED);
      expect(medicalLifecycle.settleBeforeReadOnly).not.toHaveBeenCalled();
    });

    it('closes the open incidents on transfer and audits how many', async () => {
      incidentWrites.closeOpenIncidentsByHorse.mockResolvedValue(2);
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(incidentWrites.closeOpenIncidentsByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        'Ngựa đã chuyển nhượng',
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          after: expect.objectContaining({ incidentsClosed: 2 }) as unknown,
        }),
      );
    });

    it('does not close incidents when retiring', async () => {
      await change(HorseLifecycleStatus.RETIRED);
      expect(incidentWrites.closeOpenIncidentsByHorse).not.toHaveBeenCalled();
    });

    it.each([HorseLifecycleStatus.TRANSFERRED, HorseLifecycleStatus.DECEASED])(
      'settles stable care when the horse becomes %s and audits what happened',
      async (to) => {
        stableLifecycle.settleBeforeReadOnly.mockResolvedValue({
          feedingPlansArchived: 1,
          draftFeedingPlansDeleted: 2,
          careTasksEnded: 0,
          careTasksDeleted: 1,
          checklistCancelled: true,
        });
        await service.updateLifecycle(actor, HORSE_ID, {
          lifecycleStatus: to,
          reason: 'Lý do',
        });
        expect(stableLifecycle.settleBeforeReadOnly).toHaveBeenCalledWith(
          manager,
          HORSE_ID,
          anyString,
        );
        const [, entry] = audit.record.mock.calls[0] as [
          unknown,
          { after: Record<string, unknown> },
        ];
        expect(entry.after).toMatchObject({
          feedingPlansArchived: 1,
          draftFeedingPlansDeleted: 2,
          careTasksDeleted: 1,
          checklistCancelled: true,
        });
        expect(entry.after).not.toHaveProperty('careTasksEnded');
      },
    );

    it('leaves no stable care audit key when nothing was settled', async () => {
      await change(HorseLifecycleStatus.TRANSFERRED);
      const [, entry] = audit.record.mock.calls[0] as [
        unknown,
        { after: Record<string, unknown> },
      ];
      for (const key of [
        'feedingPlansArchived',
        'draftFeedingPlansDeleted',
        'careTasksEnded',
        'careTasksDeleted',
        'checklistCancelled',
      ]) {
        expect(entry.after).not.toHaveProperty(key);
      }
    });

    it('does not settle stable care when retiring', async () => {
      await change(HorseLifecycleStatus.RETIRED);
      expect(stableLifecycle.settleBeforeReadOnly).not.toHaveBeenCalled();
    });

    it('rejects an invalid transition with 409 and writes nothing', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(change(HorseLifecycleStatus.RETIRED)).rejects.toThrow(
        ConflictException,
      );
      expectNoWrite();
    });

    it.each([HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED])(
      'refuses %s with 409 while the horse is on site for a run, and writes nothing',
      async (to) => {
        training.hasOnSiteParticipant.mockResolvedValue(true);

        await expect(change(to)).rejects.toThrow(
          new ConflictException(
            'Ngựa đang ở buổi tập (đã điểm danh), chờ kết thúc lượt tập rồi mới giải nghệ hoặc chuyển nhượng',
          ),
        );
        expectNoWrite();
      },
    );

    it('cancels the unfinished runs when recording a death and logs how many', async () => {
      training.cancelUnfinishedParticipants.mockResolvedValue(1);

      await service.updateLifecycle(actor, HORSE_ID, {
        lifecycleStatus: HorseLifecycleStatus.DECEASED,
        reason: 'Đột quỵ',
      });

      expect(training.cancelUnfinishedParticipants).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        'Ngựa đã mất',
      );
      const afters = (
        audit.record.mock.calls as Array<[unknown, { after: unknown }]>
      ).map(([, entry]) => entry.after);
      expect(afters).toContainEqual(
        expect.objectContaining({ unfinishedRunsCancelled: 1 }),
      );
    });

    it.each([HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED])(
      'allows %s while the horse is racing but not training',
      async (to) => {
        await change(to);
        expect(training.withdrawHorseFromClasses).toHaveBeenCalled();
        expect(racing.withdrawOpenRegistrationsByHorse).toHaveBeenCalledWith(
          manager,
          HORSE_ID,
        );
        expect(horseRepository.update).toHaveBeenCalledWith(
          { id: HORSE_ID },
          expect.objectContaining({ lifecycleStatus: to }),
        );
      },
    );

    it('rejects the current status with 409 and writes nothing', async () => {
      await expect(change(HorseLifecycleStatus.ACTIVE)).rejects.toThrow(
        new ConflictException('Ngựa Winx đã ở trạng thái Đang hoạt động'),
      );
      expectNoWrite();
    });
  });

  describe('with the shared HorseAccessService', () => {
    const DELETED_MESSAGE =
      'Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác';
    let sharedHorses: {
      findByIdWithDeleted: jest.Mock;
      lockHorseWithDeleted: jest.Mock;
    };

    beforeEach(() => {
      const userManager = Object.assign(manager, {
        findOne: jest.fn((entity: unknown) =>
          Promise.resolve(
            entity === UserEntity
              ? {
                  id: CALLER_ID,
                  status: UserStatus.ACTIVE,
                  role: UserRole.CLUB_MANAGER,
                }
              : null,
          ),
        ),
      });
      dataSource.manager = userManager;
      sharedHorses = {
        findByIdWithDeleted: jest.fn(() => Promise.resolve(horse)),
        lockHorseWithDeleted: jest.fn(() => Promise.resolve(horse)),
      };
      const typedDataSource = dataSource as unknown as DataSource;
      service = new HorseStatusesService(
        statuses,
        Object.assign(new HorseAccessService(typedDataSource), sharedHorses),
        typedDataSource,
        audit,
        stalls as unknown as StallsService,
        grooms as unknown as GroomAssignmentsService,
        trainingLocks as unknown as TrainingLockService,
        medicalLifecycle as unknown as MedicalLifecycleService,
        incidentWrites,
        stableLifecycle,
        racing,
        events,
        training as unknown as TrainingOperationsFacade,
        ownerships,
      );
    });

    it('returns 404 when the horse is missing', async () => {
      sharedHorses.lockHorseWithDeleted.mockResolvedValue(null);
      await expect(
        service.updateLifecycle(actor, HORSE_ID, {
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
          reason: 'Giải nghệ',
        }),
      ).rejects.toThrow(NotFoundException);
      expectNoWrite();
    });

    it('rejects a CLUB_MANAGER changing the lifecycle of a deleted profile with 409 and writes nothing', async () => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');
      await expect(
        service.updateLifecycle(actor, HORSE_ID, {
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
          reason: 'Giải nghệ',
        }),
      ).rejects.toThrow(new ConflictException(DELETED_MESSAGE));
      expectNoWrite();
    });

    it('rejects a CLUB_MANAGER previewing a lifecycle change of a deleted profile with 409', async () => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');
      await expect(
        service.previewLifecycle(actor, HORSE_ID, {
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
        }),
      ).rejects.toThrow(new ConflictException(DELETED_MESSAGE));
      expect(statuses.lifecycleImpact).not.toHaveBeenCalled();
    });
  });

  describe('previewLifecycle', () => {
    const preview = (lifecycleStatus: HorseLifecycleStatus) =>
      service.previewLifecycle(actor, HORSE_ID, { lifecycleStatus });

    const expectNothingWritten = () => {
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expectNoWrite();
    };

    beforeEach(() => {
      access.hasActiveTrainingLock.mockImplementation(() =>
        Promise.resolve(impact.hasActiveTrainingLock),
      );
    });

    it('checks the profile with the write rules (403/404 on a deleted profile)', async () => {
      await preview(HorseLifecycleStatus.RETIRED);
      expect(access.findWritableHorse).toHaveBeenCalledWith(actor, HORSE_ID);
      expect(access.hasActiveTrainingLock).toHaveBeenCalledWith(
        HORSE_ID,
        manager,
      );
    });

    it('reports every transfer effect from ACTIVE', async () => {
      impact.ownerName = 'Chủ A';
      await expect(preview(HorseLifecycleStatus.TRANSFERRED)).resolves.toEqual({
        horseId: HORSE_ID,
        from: HorseLifecycleStatus.ACTIVE,
        to: HorseLifecycleStatus.TRANSFERRED,
        allowed: true,
        blockedReason: null,
        classesWithdrawn: 2,
        raceRegistrationsWithdrawn: 3,
        stallReleased: 'A-01',
        groomEnded: 'Groom A',
        barnCleared: 'Khu A',
        trainingLockReleased: true,
        examRequestsDismissed: 0,
        careSchedulesCancelled: 0,
        incidentsClosed: 0,
        feedingPlansArchived: 0,
        draftFeedingPlansDeleted: 0,
        careTasksEnded: 0,
        careTasksDeleted: 0,
        checklistCancelled: false,
        healthResetTo: null,
        pendingBarnAfter: false,
        ownerCleared: 'Chủ A',
        ownerRequired: false,
        summary:
          'Winx đang có 2 lớp đang học, 3 đăng ký thi đấu chưa diễn ra, ô chuồng A-01, Groom Groom A phụ trách, lệnh khóa huấn luyện, chủ Chủ A. Nếu chuyển nhượng sẽ rút khỏi lớp, rút khỏi giải, trả ô chuồng, kết thúc phân công Groom, bỏ khu Khu A, gỡ khóa huấn luyện, kết thúc sở hữu của chủ hiện tại.',
      });
      expectNothingWritten();
    });

    it('summarises a retirement like the BA example', async () => {
      impact.activeClasses = 2;
      impact.openRaceRegistrations = 1;
      await expect(preview(HorseLifecycleStatus.RETIRED)).resolves.toEqual(
        expect.objectContaining({
          summary:
            'Winx đang có 2 lớp đang học, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ rút khỏi lớp, rút khỏi giải.',
        }),
      );
    });

    it('allows retiring in the preview while the horse is racing', async () => {
      await expect(preview(HorseLifecycleStatus.RETIRED)).resolves.toEqual(
        expect.objectContaining({ allowed: true, blockedReason: null }),
      );
    });

    it('blocks retiring in the preview while the horse has an ongoing run', async () => {
      training.hasOnSiteParticipant.mockResolvedValue(true);

      await expect(preview(HorseLifecycleStatus.RETIRED)).resolves.toEqual(
        expect.objectContaining({
          allowed: false,
          blockedReason:
            'Ngựa đang ở buổi tập (đã điểm danh), chờ kết thúc lượt tập rồi mới giải nghệ hoặc chuyển nhượng',
        }),
      );
    });

    it('reports the class withdrawal but no registration effect for a RETIRED horse being transferred', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await expect(preview(HorseLifecycleStatus.TRANSFERRED)).resolves.toEqual(
        expect.objectContaining({
          allowed: true,
          classesWithdrawn: 2,
          raceRegistrationsWithdrawn: 0,
          stallReleased: 'A-01',
          barnCleared: 'Khu A',
        }),
      );
      expectNothingWritten();
    });

    it('reports the health reset when reactivating', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(preview(HorseLifecycleStatus.ACTIVE)).resolves.toEqual({
        horseId: HORSE_ID,
        from: HorseLifecycleStatus.TRANSFERRED,
        to: HorseLifecycleStatus.ACTIVE,
        allowed: true,
        blockedReason: null,
        classesWithdrawn: 0,
        raceRegistrationsWithdrawn: 0,
        stallReleased: null,
        groomEnded: null,
        barnCleared: null,
        trainingLockReleased: false,
        examRequestsDismissed: 0,
        careSchedulesCancelled: 0,
        incidentsClosed: 0,
        feedingPlansArchived: 0,
        draftFeedingPlansDeleted: 0,
        careTasksEnded: 0,
        careTasksDeleted: 0,
        checklistCancelled: false,
        healthResetTo: HorseHealthStatus.QUARANTINED,
        pendingBarnAfter: true,
        ownerCleared: null,
        ownerRequired: true,
        summary:
          'Nếu kích hoạt lại sẽ đưa ngựa vào danh sách Chờ xếp khu (cần xếp lại khu, ô chuồng và Groom), gán chủ sở hữu mới được chọn, đặt sức khỏe về Cách ly tới khi bác sĩ khám lại.',
      });
      expectNothingWritten();
    });

    it('does not check the owner when reactivating a RETIRED horse', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await expect(preview(HorseLifecycleStatus.ACTIVE)).resolves.toEqual(
        expect.objectContaining({
          pendingBarnAfter: false,
          ownerCleared: null,
          ownerRequired: false,
        }),
      );
    });

    it('blocks an invalid transition', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(preview(HorseLifecycleStatus.RETIRED)).resolves.toEqual(
        expect.objectContaining({
          allowed: false,
          blockedReason:
            'Không thể chuyển vòng đời từ Đã chuyển nhượng sang Đã giải nghệ',
          summary: null,
        }),
      );
      expectNothingWritten();
    });

    it('blocks a transfer while the horse has an open medical case', async () => {
      medicalLifecycle.readOnlyBlockReason.mockResolvedValue(
        OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
      );
      await expect(preview(HorseLifecycleStatus.TRANSFERRED)).resolves.toEqual(
        expect.objectContaining({
          allowed: false,
          blockedReason: OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
          summary: null,
        }),
      );
      expect(medicalLifecycle.readOnlyBlockReason).toHaveBeenCalledWith(
        HORSE_ID,
        HorseLifecycleStatus.TRANSFERRED,
        manager,
      );
      expectNothingWritten();
    });

    it('lists the medical work a transfer will close', async () => {
      impact.examRequestsToDismiss = 2;
      impact.careSchedulesToCancel = 1;
      await expect(preview(HorseLifecycleStatus.TRANSFERRED)).resolves.toEqual(
        expect.objectContaining({
          examRequestsDismissed: 2,
          careSchedulesCancelled: 1,
        }),
      );
      expect(medicalLifecycle.readOnlyImpact).toHaveBeenCalledWith(
        HORSE_ID,
        manager,
      );
    });

    it('lists the open incidents a transfer will close', async () => {
      impact.openIncidents = 2;
      const shown = await preview(HorseLifecycleStatus.TRANSFERRED);
      expect(shown.incidentsClosed).toBe(2);
      expect(shown.summary).toContain('2 sự cố đang mở');
    });

    it('lists the stable care a transfer will settle', async () => {
      Object.assign(impact, {
        feedingPlansToArchive: 1,
        draftFeedingPlansToDelete: 2,
        careTasksToEnd: 1,
        careTasksToDelete: 3,
        checklistToCancel: true,
      });
      const shown = await preview(HorseLifecycleStatus.TRANSFERRED);
      expect(shown).toMatchObject({
        feedingPlansArchived: 1,
        draftFeedingPlansDeleted: 2,
        careTasksEnded: 1,
        careTasksDeleted: 3,
        checklistCancelled: true,
      });
      expect(shown.summary).toContain(
        'khẩu phần đang áp dụng, 2 bản nháp khẩu phần, 1 việc riêng đang áp dụng, 3 việc riêng chưa bắt đầu, checklist hôm nay chưa xong',
      );
      expect(shown.summary).toContain(
        'lưu trữ khẩu phần, xóa các bản nháp đó, kết thúc các việc riêng đó ở hôm nay, xóa các việc riêng chưa bắt đầu, hủy checklist hôm nay',
      );
    });

    it('does not count stable care when previewing a retirement', async () => {
      impact.checklistToCancel = true;
      const shown = await preview(HorseLifecycleStatus.RETIRED);
      expect(stableLifecycle.readOnlyImpact).not.toHaveBeenCalled();
      expect(shown.checklistCancelled).toBe(false);
    });

    it('does not check medical cases when previewing a retirement', async () => {
      await preview(HorseLifecycleStatus.RETIRED);
      expect(medicalLifecycle.readOnlyBlockReason).not.toHaveBeenCalled();
    });

    it('blocks choosing the current status', async () => {
      await expect(preview(HorseLifecycleStatus.ACTIVE)).resolves.toEqual(
        expect.objectContaining({
          allowed: false,
          blockedReason: 'Ngựa Winx đã ở trạng thái Đang hoạt động',
        }),
      );
      expectNothingWritten();
    });
  });
});

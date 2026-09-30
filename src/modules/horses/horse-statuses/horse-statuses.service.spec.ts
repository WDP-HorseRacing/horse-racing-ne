import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { OPEN_CASE_BLOCKS_TRANSFER_MESSAGE } from '../../medical/constants/medical.constants';
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
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type { LifecycleImpactRow } from '../types/horse.types';
import { HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT } from '../constants/horse.constants';
import { HorseStatusesService } from './horse-statuses.service';

type HorseRow = Partial<HorseEntity> & { id: string };

const anyString: unknown = expect.any(String);
const anyDate: unknown = expect.any(Date);
const HORSE_ID = 'h1';
const CALLER_ID = 'cm-1';

describe('HorseStatusesService', () => {
  let horse: HorseRow;
  let impact: LifecycleImpactRow;
  let horseRepository: { update: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let dataSource: { manager: typeof manager; transaction: jest.Mock };
  let statuses: {
    lifecycleImpact: jest.Mock;
  };
  let training: { withdrawHorseFromClasses: jest.Mock };
  let horses: {
    hasActiveTrainingLock: jest.Mock;
    lockActiveHorseOwner: jest.Mock;
    inactiveOwnerName: jest.Mock;
  };
  let access: {
    currentUser: jest.Mock;
    lockWritableHorse: jest.Mock;
    findHorse: jest.Mock;
    findWritableHorse: jest.Mock;
    assertNotTransferred: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let stalls: { releaseStallByHorse: jest.Mock };
  let grooms: { endGroomByHorse: jest.Mock };
  let trainingLocks: { releaseActiveLockByHorse: jest.Mock };
  let medicalLifecycle: {
    settleForTransfer: jest.Mock;
    transferBlockReason: jest.Mock;
    transferImpact: jest.Mock;
  };
  let racing: { withdrawOpenRegistrationsByHorse: jest.Mock };
  let events: { publish: jest.Mock };
  let service: HorseStatusesService;

  const actor: Actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };

  const sideEffectMocks = () => [
    training.withdrawHorseFromClasses,
    racing.withdrawOpenRegistrationsByHorse,
    stalls.releaseStallByHorse,
    grooms.endGroomByHorse,
    trainingLocks.releaseActiveLockByHorse,
    medicalLifecycle.settleForTransfer,
  ];

  const expectNoWrite = () => {
    for (const mock of sideEffectMocks()) {
      expect(mock).not.toHaveBeenCalled();
    }
    expect(horseRepository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  };

  beforeEach(() => {
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
      invalidOwnerName: null,
      examRequestsToDismiss: 0,
      careSchedulesToCancel: 0,
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
    };
    horses = {
      hasActiveTrainingLock: jest.fn().mockResolvedValue(false),
      lockActiveHorseOwner: jest.fn().mockResolvedValue(true),
      inactiveOwnerName: jest.fn().mockResolvedValue(null),
    };
    access = {
      currentUser: jest.fn().mockResolvedValue({ id: CALLER_ID }),
      lockWritableHorse: jest.fn(() => Promise.resolve(horse)),
      findHorse: jest.fn(() => Promise.resolve(horse)),
      findWritableHorse: jest.fn(() => Promise.resolve(horse)),
      assertNotTransferred: jest.fn(),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    stalls = {
      releaseStallByHorse: jest
        .fn()
        .mockResolvedValue({ stallId: 's1', stallCode: 'A-01' }),
    };
    grooms = { endGroomByHorse: jest.fn().mockResolvedValue('g1') };
    events = { publish: jest.fn() };
    trainingLocks = {
      releaseActiveLockByHorse: jest.fn().mockResolvedValue(true),
    };
    medicalLifecycle = {
      settleForTransfer: jest.fn().mockResolvedValue({
        examRequestsDismissed: 0,
        careSchedulesCancelled: 0,
      }),
      transferBlockReason: jest.fn().mockResolvedValue(null),
      transferImpact: jest.fn(() =>
        Promise.resolve({
          examRequestsToDismiss: impact.examRequestsToDismiss,
          careSchedulesToCancel: impact.careSchedulesToCancel,
        }),
      ),
    };
    racing = {
      withdrawOpenRegistrationsByHorse: jest.fn().mockResolvedValue(3),
    };
    service = new HorseStatusesService(
      statuses,
      horses as unknown as HorsesSharedRepository,
      access as unknown as HorseAccessService,
      dataSource as unknown as DataSource,
      audit,
      stalls as unknown as StallsService,
      grooms as unknown as GroomAssignmentsService,
      trainingLocks as unknown as TrainingLockService,
      medicalLifecycle as unknown as MedicalLifecycleService,
      racing,
      events as unknown as DomainEventPublisher,
      training as unknown as TrainingOperationsFacade,
    );
  });

  describe('updateLifecycle', () => {
    const change = (lifecycleStatus: HorseLifecycleStatus, reason = 'Bán') =>
      service.updateLifecycle(actor, HORSE_ID, { lifecycleStatus, reason });

    it('publishes the released groom after the transfer commits (BA 2026-09-23)', async () => {
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(events.publish).toHaveBeenCalledWith(
        HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT,
        { eventId: anyString, horseId: HORSE_ID, groomId: 'g1' },
      );
      expect(events.publish.mock.invocationCallOrder[0]).toBeGreaterThan(
        dataSource.transaction.mock.invocationCallOrder[0],
      );
    });

    it('tells no groom when the transferred horse had none', async () => {
      grooms.endGroomByHorse.mockResolvedValue(null);
      await change(HorseLifecycleStatus.TRANSFERRED);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('tells no groom on retirement because the groom stays', async () => {
      await change(HorseLifecycleStatus.RETIRED);
      expect(events.publish).not.toHaveBeenCalled();
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
      expect(stalls.releaseStallByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(grooms.endGroomByHorse).toHaveBeenCalledWith(manager, HORSE_ID);
      expect(trainingLocks.releaseActiveLockByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        'Gỡ do chuyển nhượng',
      );
    });

    it('clears an owner who is no longer an active HORSE_OWNER when reactivating a transfer, and audits it', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      horses.lockActiveHorseOwner.mockResolvedValue(false);
      await change(HorseLifecycleStatus.ACTIVE, 'Mua lại');
      expect(horses.lockActiveHorseOwner).toHaveBeenCalledWith(
        manager,
        'owner-1',
      );
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID },
        expect.objectContaining({ ownerId: null }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: expect.objectContaining({ ownerId: 'owner-1' }) as unknown,
          after: expect.objectContaining({ ownerId: null }) as unknown,
        }),
      );
    });

    it('keeps a valid owner when reactivating a transfer', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await change(HorseLifecycleStatus.ACTIVE, 'Mua lại');
      const [, changes] = horseRepository.update.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(changes).not.toHaveProperty('ownerId');
    });

    it('does not check the owner when reactivating a RETIRED horse', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await change(HorseLifecycleStatus.ACTIVE, 'Trở lại');
      expect(horses.lockActiveHorseOwner).not.toHaveBeenCalled();
    });

    it('clears the barn on transfer and keeps the owner', async () => {
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
      });
      expect(changes).not.toHaveProperty('ownerId');
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
          stallCode: 'A-01',
          groomId: 'g1',
        },
        after: {
          lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
          lifecycleReason: 'Bán cho CLB khác',
          barnId: null,
          stallCode: null,
          groomId: null,
          classesWithdrawn: 2,
          trainingLockReleased: true,
          examRequestsDismissed: 0,
          careSchedulesCancelled: 0,
          raceRegistrationsWithdrawn: 3,
        },
        reason: 'Bán cho CLB khác',
        feature: 'F1.8',
      });
    });

    it('audits only the transfer effects that actually happened', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      stalls.releaseStallByHorse.mockResolvedValue(null);
      grooms.endGroomByHorse.mockResolvedValue(null);
      trainingLocks.releaseActiveLockByHorse.mockResolvedValue(false);
      await change(HorseLifecycleStatus.TRANSFERRED, 'Bán');
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: {
            lifecycleStatus: HorseLifecycleStatus.RETIRED,
            lifecycleReason: null,
            barnId: 'b1',
          },
          after: {
            lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
            lifecycleReason: 'Bán',
            barnId: null,
            classesWithdrawn: 2,
            trainingLockReleased: false,
            examRequestsDismissed: 0,
            careSchedulesCancelled: 0,
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
      expect(stalls.releaseStallByHorse).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(grooms.endGroomByHorse).toHaveBeenCalledWith(manager, HORSE_ID);
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
      expect(stalls.releaseStallByHorse).not.toHaveBeenCalled();
      expect(grooms.endGroomByHorse).not.toHaveBeenCalled();
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
      'puts health under observation when reactivating from %s',
      async (from) => {
        horse.lifecycleStatus = from;
        await change(HorseLifecycleStatus.ACTIVE, 'Quay lại thi đấu');
        expect(horseRepository.update).toHaveBeenCalledWith(
          { id: HORSE_ID },
          expect.objectContaining({
            lifecycleStatus: HorseLifecycleStatus.ACTIVE,
            healthStatus: HorseHealthStatus.UNDER_OBSERVATION,
          }),
        );
        expect(audit.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            before: expect.objectContaining({
              healthStatus: HorseHealthStatus.ELIGIBLE,
            }) as unknown,
            after: expect.objectContaining({
              healthStatus: HorseHealthStatus.UNDER_OBSERVATION,
            }) as unknown,
            reason: 'Quay lại thi đấu',
            feature: 'F1.8',
          }),
        );
        for (const mock of sideEffectMocks()) {
          expect(mock).not.toHaveBeenCalled();
        }
      },
    );

    it('blocks transferring a horse with an open medical case with 409 and writes nothing', async () => {
      medicalLifecycle.settleForTransfer.mockRejectedValue(
        new ConflictException(OPEN_CASE_BLOCKS_TRANSFER_MESSAGE),
      );
      await expect(change(HorseLifecycleStatus.TRANSFERRED)).rejects.toThrow(
        new ConflictException(OPEN_CASE_BLOCKS_TRANSFER_MESSAGE),
      );
      expect(medicalLifecycle.settleForTransfer).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      for (const mock of sideEffectMocks()) {
        if (mock !== medicalLifecycle.settleForTransfer) {
          expect(mock).not.toHaveBeenCalled();
        }
      }
      expect(horseRepository.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('audits the medical follow-ups closed by the transfer', async () => {
      medicalLifecycle.settleForTransfer.mockResolvedValue({
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
      expect(medicalLifecycle.settleForTransfer).not.toHaveBeenCalled();
    });

    it('rejects an invalid transition with 409 and writes nothing', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(change(HorseLifecycleStatus.RETIRED)).rejects.toThrow(
        ConflictException,
      );
      expectNoWrite();
    });

    it.each([HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED])(
      'allows %s even while the horse is training or racing (BA 2026-09-23)',
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

    it('writes nothing when the status is unchanged', async () => {
      await change(HorseLifecycleStatus.ACTIVE);
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
      const typedHorses = sharedHorses as unknown as HorsesSharedRepository;
      service = new HorseStatusesService(
        statuses,
        typedHorses,
        new HorseAccessService(typedDataSource, typedHorses),
        typedDataSource,
        audit,
        stalls as unknown as StallsService,
        grooms as unknown as GroomAssignmentsService,
        trainingLocks as unknown as TrainingLockService,
        medicalLifecycle as unknown as MedicalLifecycleService,
        racing,
        events as unknown as DomainEventPublisher,
        training as unknown as TrainingOperationsFacade,
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
      horses.hasActiveTrainingLock.mockImplementation(() =>
        Promise.resolve(impact.hasActiveTrainingLock),
      );
    });

    it('checks the profile with the write rules (403/404 on a deleted profile)', async () => {
      await preview(HorseLifecycleStatus.RETIRED);
      expect(access.findWritableHorse).toHaveBeenCalledWith(actor, HORSE_ID);
      expect(horses.hasActiveTrainingLock).toHaveBeenCalledWith(
        HORSE_ID,
        manager,
      );
    });

    it('reports every transfer effect from ACTIVE', async () => {
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
        healthResetTo: null,
        pendingBarnAfter: false,
        ownerCleared: null,
        summary:
          'Winx đang có 2 lớp đang học, 3 đăng ký thi đấu chưa diễn ra, ô chuồng A-01, Groom Groom A phụ trách, lệnh khóa huấn luyện. Nếu chuyển nhượng sẽ rút khỏi lớp, rút khỏi giải, trả ô chuồng, kết thúc phân công Groom, bỏ khu Khu A, gỡ khóa huấn luyện.',
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

    it('allows retiring in the preview while the horse is training or racing', async () => {
      await expect(preview(HorseLifecycleStatus.RETIRED)).resolves.toEqual(
        expect.objectContaining({ allowed: true, blockedReason: null }),
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
        healthResetTo: HorseHealthStatus.UNDER_OBSERVATION,
        pendingBarnAfter: true,
        ownerCleared: null,
        summary:
          'Nếu kích hoạt lại sẽ đưa ngựa vào danh sách Chờ xếp khu (cần xếp lại khu, ô chuồng và Groom), đặt sức khỏe về Cần theo dõi tới khi bác sĩ khám lại.',
      });
      expect(horses.inactiveOwnerName).toHaveBeenCalledWith('owner-1', manager);
      expectNothingWritten();
    });

    it('warns that an owner who is no longer an active HORSE_OWNER will be cleared when reactivating a transfer', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      horses.inactiveOwnerName.mockResolvedValue('Nguyen Van B');
      await expect(preview(HorseLifecycleStatus.ACTIVE)).resolves.toEqual(
        expect.objectContaining({
          ownerCleared: 'Nguyen Van B',
          summary:
            'Nếu kích hoạt lại sẽ đưa ngựa vào danh sách Chờ xếp khu (cần xếp lại khu, ô chuồng và Groom), bỏ trống chủ Nguyen Van B vì tài khoản không còn là chủ ngựa đang hoạt động, đặt sức khỏe về Cần theo dõi tới khi bác sĩ khám lại.',
        }),
      );
    });

    it('does not check the owner when reactivating a RETIRED horse', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
      await expect(preview(HorseLifecycleStatus.ACTIVE)).resolves.toEqual(
        expect.objectContaining({
          pendingBarnAfter: false,
          ownerCleared: null,
        }),
      );
      expect(horses.inactiveOwnerName).not.toHaveBeenCalled();
    });

    it('blocks an invalid transition', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(preview(HorseLifecycleStatus.RETIRED)).resolves.toEqual(
        expect.objectContaining({
          allowed: false,
          blockedReason:
            'Không thể chuyển vòng đời từ TRANSFERRED sang RETIRED',
          summary: null,
        }),
      );
      expectNothingWritten();
    });

    it('blocks a transfer while the horse has an open medical case', async () => {
      medicalLifecycle.transferBlockReason.mockResolvedValue(
        OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
      );
      await expect(preview(HorseLifecycleStatus.TRANSFERRED)).resolves.toEqual(
        expect.objectContaining({
          allowed: false,
          blockedReason: OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
          summary: null,
        }),
      );
      expect(medicalLifecycle.transferBlockReason).toHaveBeenCalledWith(
        HORSE_ID,
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
      expect(medicalLifecycle.transferImpact).toHaveBeenCalledWith(
        HORSE_ID,
        manager,
      );
    });

    it('does not check medical cases when previewing a retirement', async () => {
      await preview(HorseLifecycleStatus.RETIRED);
      expect(medicalLifecycle.transferBlockReason).not.toHaveBeenCalled();
    });

    it('blocks choosing the current status', async () => {
      await expect(preview(HorseLifecycleStatus.ACTIVE)).resolves.toEqual(
        expect.objectContaining({
          allowed: false,
          blockedReason: 'Ngựa đang ở đúng trạng thái này',
        }),
      );
      expectNothingWritten();
    });
  });
});

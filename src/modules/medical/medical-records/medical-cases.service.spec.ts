import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseOwnershipService } from '../../horses/shared/horse-ownership.service';
import type { HorseStatusesService } from '../../horses/horse-statuses/horse-statuses.service';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../constants/medical-case.enum';
import {
  MEDICAL_CASE_CLOSED_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
} from '../constants/medical-events.constants';
import { RecoveryStatus } from '../constants/injury-marker.enum';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalCasesRepository } from './medical-cases.repository';
import { MedicalCasesService } from './medical-cases.service';
import { MedicalRecordsService } from './medical-records.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { CareScheduleWritesService } from '../shared/care-schedule-writes.service';

type Row = Record<string, unknown>;

const actorWith = (role: UserRole): Actor => ({
  sub: `kc-${role}`,
  roles: [role],
});
const vet = actorWith(UserRole.VETERINARIAN);
const visit = (
  caseId: string | null,
  examDate: string,
  cost: string,
  voided = false,
): Row => ({
  id: `r-${examDate}`,
  caseId,
  examDate: new Date(examDate),
  cost,
  voidedAt: voided ? new Date('2026-09-30T00:00:00Z') : null,
});

describe('MedicalCasesService', () => {
  let openCase: Row;
  let closedCase: Row;
  let caseRow: Row | null;
  let lockRow: Row | null;
  let visitRows: Row[];
  let manager: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let cases: {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let horseAccess: {
    findReadableHorseForActor: jest.Mock;
    findReadableHorse: jest.Mock;
    scopeOf: jest.Mock;
    currentUser: jest.Mock;
  };
  let ownerships: { periodsOfHorse: jest.Mock };
  let access: {
    lockHorseForWrite: jest.Mock;
    currentInjuryStatuses: jest.Mock;
  };
  let casesRepository: {
    costByHorse: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let service: MedicalCasesService;

  const updatesOn = (entity: unknown) =>
    (manager.update.mock.calls as Array<[unknown, unknown, Row]>).filter(
      ([target]) => target === entity,
    );

  beforeEach(() => {
    openCase = {
      id: 'case-1',
      horseId: 'h1',
      status: MedicalCaseStatus.OPEN,
    };
    closedCase = {
      id: 'case-2',
      horseId: 'h1',
      status: MedicalCaseStatus.CLOSED,
    };
    caseRow = openCase;
    lockRow = null;
    visitRows = [
      visit('case-1', '2026-09-10T03:00:00Z', '400000'),
      visit('case-1', '2026-09-12T03:00:00Z', '900000', true),
      visit('case-2', '2026-08-10T03:00:00Z', '1500000'),
      visit(null, '2026-07-10T03:00:00Z', '200000'),
    ];
    manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(entity === TrainingLockEntity ? lockRow : null),
      ),
      findOneOrFail: jest.fn(() => Promise.resolve({ ...caseRow })),
      find: jest.fn((entity: unknown, options?: { where?: Row }) =>
        Promise.resolve(
          entity === MedicalRecordEntity
            ? visitRows.filter(
                (row) =>
                  options?.where?.caseId === undefined ||
                  row.caseId === options.where.caseId,
              )
            : [],
        ),
      ),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => unknown) =>
        work(manager),
      ),
    };
    cases = {
      find: jest.fn(() => Promise.resolve([openCase, closedCase])),
      findOne: jest.fn(() => Promise.resolve(caseRow)),
    };
    horseAccess = {
      findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }),
      findReadableHorse: jest.fn(
        (_manager: unknown, actor: Actor, _callerId: string, horseId: string) =>
          horseAccess.findReadableHorseForActor(
            actor,
            horseId,
          ) as Promise<unknown>,
      ),
      scopeOf: jest.fn((actor: Actor, userId: string) =>
        actor.roles.length === 1 && actor.roles[0] === UserRole.HORSE_OWNER
          ? { kind: 'OWNER', userId }
          : { kind: 'ALL' },
      ),
      currentUser: jest.fn().mockResolvedValue({ id: 'cm-1' }),
    };
    ownerships = { periodsOfHorse: jest.fn().mockResolvedValue([]) };
    access = {
      lockHorseForWrite: jest.fn().mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'h1', ownerId: 'owner-b' },
      }),
      currentInjuryStatuses: jest
        .fn()
        .mockResolvedValue(new Map([['inj-1', RecoveryStatus.HEALED]])),
    };
    casesRepository = {
      costByHorse: jest.fn().mockResolvedValue([]),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    const medicalRecords = {
      manager,
      find: (options: unknown) =>
        manager.find(MedicalRecordEntity, options) as Promise<unknown>,
    } as unknown as Repository<MedicalRecordEntity>;
    const none = { find: jest.fn().mockResolvedValue([]) };
    service = new MedicalCasesService(
      dataSource as unknown as DataSource,
      horseAccess as unknown as HorseAccessService,
      access as unknown as MedicalAccessService,
      new TrainingLockWritesService(),
      new MedicalRecordsService(
        horseAccess as unknown as HorseAccessService,
        medicalRecords,
        none as unknown as Repository<PrescriptionEntity>,
        none as unknown as Repository<InjuryMarkerEntity>,
        ownerships as unknown as HorseOwnershipService,
        {
          followUpDates: jest.fn().mockResolvedValue(new Map()),
        } as unknown as MedicalCheckupsService,
      ),
      casesRepository as unknown as MedicalCasesRepository,
      cases as unknown as Repository<MedicalCaseEntity>,
      medicalRecords,
      audit,
      events,
      ownerships as unknown as HorseOwnershipService,
      {
        previewDeath: jest.fn().mockResolvedValue({ summary: 'Ngựa mất' }),
      } as unknown as HorseStatusesService,
      {
        syncCaseFollowUps: jest.fn().mockResolvedValue(undefined),
      } as unknown as CareScheduleWritesService,
    );
  });

  describe('owner cost by ownership period', () => {
    beforeEach(() => {
      horseAccess.currentUser.mockResolvedValue({ id: 'owner-b' });
      ownerships.periodsOfHorse.mockResolvedValue([
        {
          ownerId: 'owner-a',
          startedAt: new Date('2026-01-01T03:00:00Z'),
          endedAt: new Date('2026-09-11T03:00:00Z'),
        },
        {
          ownerId: 'owner-b',
          startedAt: new Date('2026-09-11T03:00:00Z'),
          endedAt: null,
        },
      ]);
      visitRows = [
        visit('case-1', '2026-09-10T03:00:00Z', '3000000'),
        visit('case-1', '2026-09-12T03:00:00Z', '2000000'),
        visit('case-1', '2026-09-13T03:00:00Z', '900000', true),
        visit('case-2', '2026-08-10T03:00:00Z', '1500000'),
        visit(null, '2026-09-20T03:00:00Z', '100000'),
      ];
    });

    it('sums for an owner only the visits of their own period, across an ownership change mid-treatment', async () => {
      const result = await service.listCases(
        actorWith(UserRole.HORSE_OWNER),
        'h1',
        {},
      );
      expect(result.items.map((item) => [item.id, item.totalCost])).toEqual([
        ['case-1', 2000000],
        ['case-2', 0],
      ]);
      expect(result.totalCost).toBe(2100000);
      for (const item of result.items) {
        expect(item).not.toHaveProperty('costHidden');
      }
    });

    it('hides the visits of the previous owner on the case detail and sums only theirs', async () => {
      const result = await service.getCase(
        actorWith(UserRole.HORSE_OWNER),
        'case-1',
      );
      expect(result.totalCost).toBe(2000000);
      expect(
        result.visits.map((item) => [
          item.examDate,
          item.cost,
          item.costHidden,
        ]),
      ).toEqual([
        [new Date('2026-09-10T03:00:00Z'), null, true],
        [new Date('2026-09-12T03:00:00Z'), 2000000, false],
        [new Date('2026-09-13T03:00:00Z'), 900000, false],
      ]);
    });

    it('keeps the full cost for a club manager', async () => {
      const result = await service.listCases(
        actorWith(UserRole.CLUB_MANAGER),
        'h1',
        {},
      );
      expect(result.items.map((item) => item.totalCost)).toEqual([
        5000000, 1500000,
      ]);
      expect(result.totalCost).toBe(6600000);
      expect(ownerships.periodsOfHorse).not.toHaveBeenCalled();
    });
  });

  describe('listCases', () => {
    it('hides every cost key from a head trainer', async () => {
      const result = await service.listCases(
        actorWith(UserRole.HEAD_TRAINER),
        'h1',
        {},
      );
      expect(result).not.toHaveProperty('totalCost');
      for (const item of result.items) {
        expect(item).not.toHaveProperty('totalCost');
      }
      expect(manager.find).not.toHaveBeenCalled();
    });

    it('sums every visit of the horse not voided, in and out of cases, even when the list is filtered', async () => {
      cases.find.mockResolvedValue([openCase]);

      const result = await service.listCases(
        actorWith(UserRole.CLUB_MANAGER),
        'h1',
        { status: MedicalCaseStatus.OPEN },
      );

      expect(result.items.map((item) => item.totalCost)).toEqual([400000]);
      expect(result.totalCost).toBe(2100000);
    });

    it('answers not found for a horse outside the caller scope', async () => {
      horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
      await expect(
        service.listCases(actorWith(UserRole.HORSE_OWNER), 'h9', {}),
      ).rejects.toThrow(NotFoundException);
      expect(cases.find).not.toHaveBeenCalled();
    });
  });

  describe('getCase', () => {
    it('answers not found for a missing case', async () => {
      caseRow = null;
      await expect(service.getCase(vet, 'case-404')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('answers not found when the horse of the case is outside the caller scope', async () => {
      horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
      await expect(service.getCase(vet, 'case-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(manager.find).not.toHaveBeenCalled();
    });
  });

  describe('closePreview', () => {
    it('answers not found for a missing case', async () => {
      caseRow = null;
      await expect(service.closePreview(vet, 'case-404')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('answers not found when the horse of the case is outside the caller scope', async () => {
      horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
      await expect(service.closePreview(vet, 'case-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('answers conflict for a case already closed', async () => {
      caseRow = closedCase;
      await expect(service.closePreview(vet, 'case-2')).rejects.toThrow(
        ConflictException,
      );
      expect(manager.findOne).not.toHaveBeenCalled();
    });

    it('shows the active lock, the health warning and the pending requests', async () => {
      horseAccess.findReadableHorseForActor.mockResolvedValue({
        id: 'h1',
        healthStatus: HorseHealthStatus.INJURED,
      });
      lockRow = {
        id: 'lock-1',
        status: TrainingLockStatus.ACTIVE,
        lockStart: new Date('2026-09-20T00:00:00Z'),
        lockEnd: null,
        reason: 'Viêm gân',
      };
      manager.count.mockResolvedValue(2);
      access.currentInjuryStatuses.mockResolvedValue(
        new Map([
          ['inj-1', RecoveryStatus.HEALED],
          ['inj-2', RecoveryStatus.RECOVERING],
          ['inj-3', RecoveryStatus.ACUTE],
        ]),
      );
      const result = await service.closePreview(vet, 'case-1');
      expect(access.currentInjuryStatuses).toHaveBeenCalledWith(manager, 'h1');
      expect(result).toMatchObject({
        activeLock: expect.objectContaining({ id: 'lock-1' }) as unknown,
        healthStatus: HorseHealthStatus.INJURED,
        healthWarning: true,
        pendingRequestCount: 2,
        unhealedInjuryCount: 2,
        deathImpact: { summary: 'Ngựa mất' },
      });
    });
  });

  describe('closeCase', () => {
    const close = (body: Row = {}) =>
      service.closeCase(vet, 'case-1', {
        finalConclusion: 'Đã hồi phục',
        ...body,
      });

    it('answers conflict for a case already closed and writes nothing', async () => {
      caseRow = closedCase;
      await expect(close()).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('answers not found for a missing case', async () => {
      caseRow = null;
      await expect(close()).rejects.toThrow(NotFoundException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('answers conflict while an injury of the horse is not healed and writes nothing', async () => {
      access.currentInjuryStatuses.mockResolvedValue(
        new Map([
          ['inj-1', RecoveryStatus.HEALED],
          ['inj-2', RecoveryStatus.RECOVERING],
        ]),
      );
      await expect(close()).rejects.toThrow(ConflictException);
      expect(access.currentInjuryStatuses).toHaveBeenCalledWith(manager, 'h1');
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it.each([
      ['not found for a horse outside the caller scope', NotFoundException],
      ['conflict for a transferred horse', ConflictException],
    ])('propagates %s', async (_label, error) => {
      access.lockHorseForWrite.mockRejectedValue(new error());
      await expect(close()).rejects.toThrow(error);
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('requires an expected end when keeping the lock', async () => {
      lockRow = { id: 'lock-1', status: TrainingLockStatus.ACTIVE };
      await expect(
        close({ lockDecision: CaseLockDecision.KEEP }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('requires a decision while the case lock is still active', async () => {
      lockRow = { id: 'lock-1', status: TrainingLockStatus.ACTIVE };
      await expect(close()).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('closes the case, releases the lock and publishes both events in the transaction', async () => {
      lockRow = { id: 'lock-1', status: TrainingLockStatus.ACTIVE };
      const result = await close({ lockDecision: CaseLockDecision.RELEASE });

      expect(updatesOn(MedicalCaseEntity)[0][2]).toEqual({
        status: MedicalCaseStatus.CLOSED,
        closedAt: expect.any(Date) as unknown,
        closedBy: 'vet-1',
        finalConclusion: 'Đã hồi phục',
      });
      expect(updatesOn(TrainingLockEntity)[0]).toEqual([
        TrainingLockEntity,
        { id: 'lock-1' },
        expect.objectContaining({
          status: TrainingLockStatus.RELEASED,
          releasedBy: 'vet-1',
        }),
      ]);
      expect(result.totalCost).toBe(400000);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          entityType: AuditEntityType.TRAINING_LOCK,
          entityId: 'lock-1',
          after: expect.objectContaining({
            status: TrainingLockStatus.RELEASED,
          }) as unknown,
        }),
      );
      expect(
        (events.publish.mock.calls as Array<[unknown, string]>).map(
          ([tx, name]) => [tx, name],
        ),
      ).toEqual([
        [manager, MEDICAL_CASE_CLOSED_EVENT],
        [manager, MEDICAL_TRAINING_LOCK_RELEASED_EVENT],
      ]);
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
        expect.objectContaining({ lockId: 'lock-1', ownerId: 'owner-b' }),
      );
    });

    it('snapshots in the closed event the cost of the whole case and the part of the current owner', async () => {
      visitRows = [
        visit('case-1', '2026-09-10T03:00:00Z', '3000000'),
        visit('case-1', '2026-09-12T03:00:00Z', '2000000'),
        visit('case-1', '2026-09-13T03:00:00Z', '900000', true),
      ];
      ownerships.periodsOfHorse.mockResolvedValue([
        {
          ownerId: 'owner-a',
          startedAt: new Date('2026-01-01T03:00:00Z'),
          endedAt: new Date('2026-09-11T03:00:00Z'),
        },
        {
          ownerId: 'owner-b',
          startedAt: new Date('2026-09-11T03:00:00Z'),
          endedAt: null,
        },
      ]);

      const result = await close();

      expect(result.totalCost).toBe(5000000);
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_CASE_CLOSED_EVENT,
        expect.objectContaining({
          caseId: 'case-1',
          totalCost: 5000000,
          ownerId: 'owner-b',
          ownerCost: 2000000,
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          entityType: AuditEntityType.MEDICAL_CASE,
          after: expect.not.objectContaining({
            totalCost: expect.anything() as unknown,
          }) as unknown,
        }),
      );
    });

    it('names no owner part when the horse has no owner at closing', async () => {
      access.lockHorseForWrite.mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'h1', ownerId: null },
      });
      await close();
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_CASE_CLOSED_EVENT,
        expect.objectContaining({
          totalCost: 400000,
          ownerId: null,
          ownerCost: null,
        }),
      );
      expect(ownerships.periodsOfHorse).not.toHaveBeenCalled();
    });

    it('keeps the lock with the expected end when asked', async () => {
      lockRow = { id: 'lock-1', status: TrainingLockStatus.ACTIVE };
      const expectedEnd = new Date(Date.now() + 7 * 86400000).toISOString();
      await close({
        lockDecision: CaseLockDecision.KEEP,
        lockExpectedEnd: expectedEnd,
      });
      expect(updatesOn(TrainingLockEntity)[0][2]).toEqual({
        lockEnd: new Date(expectedEnd),
      });
      expect(
        (events.publish.mock.calls as Array<[unknown, string]>).map(
          ([, name]) => name,
        ),
      ).toEqual([MEDICAL_CASE_CLOSED_EVENT]);
    });
  });

  describe('costReport', () => {
    it('rejects a range that ends before it starts', async () => {
      await expect(
        service.costReport(actorWith(UserRole.CLUB_MANAGER), {
          from: '2026-10-01',
          to: '2026-09-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sums the cost and visit count of every horse', async () => {
      casesRepository.costByHorse.mockResolvedValue([
        {
          horseId: 'h1',
          horseName: 'Winx',
          visitCount: 2,
          totalCost: '3000000',
        },
        { horseId: 'h2', horseName: 'Gió', visitCount: 1, totalCost: '500000' },
      ]);
      await expect(
        service.costReport(actorWith(UserRole.CLUB_MANAGER), {
          from: '2026-09-01',
          to: '2026-09-30',
        }),
      ).resolves.toMatchObject({ visitCount: 3, totalCost: 3500000 });
    });
  });
});

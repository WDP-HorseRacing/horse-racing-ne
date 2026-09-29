import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../constants/medical-case.enum';
import {
  MEDICAL_CASE_CLOSED_EVENT,
  MEDICAL_CASE_COST_ADJUSTED_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
} from '../constants/medical-events.constants';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalCasesRepository } from './medical-cases.repository';
import { MedicalCasesService } from './medical-cases.service';
import { MedicalRecordsService } from './medical-records.service';

type Row = Record<string, unknown>;

const actorWith = (role: UserRole): Actor => ({
  sub: `kc-${role}`,
  roles: [role],
});
const vet = actorWith(UserRole.VETERINARIAN);

describe('MedicalCasesService', () => {
  let openCase: Row;
  let closedCase: Row;
  let caseRow: Row | null;
  let lockRow: Row | null;
  let manager: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let cases: { find: jest.Mock; findOne: jest.Mock };
  let horseAccess: { findReadable: jest.Mock; currentUser: jest.Mock };
  let access: { lockHorseForWrite: jest.Mock };
  let casesRepository: {
    costByHorse: jest.Mock;
    closedCostOfHorse: jest.Mock;
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
      totalCost: null,
    };
    closedCase = {
      id: 'case-2',
      horseId: 'h1',
      status: MedicalCaseStatus.CLOSED,
      totalCost: '1500000',
    };
    caseRow = openCase;
    lockRow = null;
    manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(entity === TrainingLockEntity ? lockRow : null),
      ),
      findOneOrFail: jest.fn(() => Promise.resolve({ ...caseRow })),
      find: jest.fn().mockResolvedValue([]),
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
      findReadable: jest.fn().mockResolvedValue({ id: 'h1' }),
      currentUser: jest.fn().mockResolvedValue({ id: 'cm-1' }),
    };
    access = {
      lockHorseForWrite: jest.fn().mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'h1' },
      }),
    };
    casesRepository = {
      costByHorse: jest.fn().mockResolvedValue([]),
      closedCostOfHorse: jest.fn().mockResolvedValue(1500000),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn() };
    service = new MedicalCasesService(
      dataSource as unknown as DataSource,
      horseAccess as unknown as HorseAccessService,
      access as unknown as MedicalAccessService,
      {
        toResponses: jest.fn().mockResolvedValue([]),
      } as unknown as MedicalRecordsService,
      casesRepository as unknown as MedicalCasesRepository,
      cases as unknown as Repository<MedicalCaseEntity>,
      audit,
      events as unknown as DomainEventPublisher,
    );
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
      expect(casesRepository.closedCostOfHorse).not.toHaveBeenCalled();
    });

    it('sums every closed case of the horse even when the list is filtered', async () => {
      cases.find.mockResolvedValue([openCase]);

      const result = await service.listCases(
        actorWith(UserRole.CLUB_MANAGER),
        'h1',
        { status: MedicalCaseStatus.OPEN },
      );

      expect(result.items).toHaveLength(1);
      expect(result.totalCost).toBe(1500000);
      expect(casesRepository.closedCostOfHorse).toHaveBeenCalledWith('h1');
    });

    it('shows an owner the cost of closed cases only and sums them', async () => {
      const result = await service.listCases(
        actorWith(UserRole.HORSE_OWNER),
        'h1',
        {},
      );
      expect(result.totalCost).toBe(1500000);
      expect(result.items.map((item) => item.totalCost)).toEqual([
        null,
        1500000,
      ]);
    });

    it('answers not found for a horse outside the caller scope', async () => {
      horseAccess.findReadable.mockRejectedValue(new NotFoundException());
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
  });

  describe('closeCase', () => {
    const close = (body: Row = {}) =>
      service.closeCase(vet, 'case-1', {
        finalConclusion: 'Đã hồi phục',
        totalCost: 2000000,
        ...body,
      });

    it('answers conflict for a case already closed and writes nothing', async () => {
      caseRow = closedCase;
      await expect(close()).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('requires a decision while the case lock is still active', async () => {
      lockRow = { id: 'lock-1', status: TrainingLockStatus.ACTIVE };
      await expect(close()).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('closes the case, releases the lock and publishes both events after commit', async () => {
      lockRow = { id: 'lock-1', status: TrainingLockStatus.ACTIVE };
      const result = await close({ lockDecision: CaseLockDecision.RELEASE });

      expect(updatesOn(MedicalCaseEntity)[0][2]).toMatchObject({
        status: MedicalCaseStatus.CLOSED,
        closedBy: 'vet-1',
        totalCost: '2000000',
      });
      expect(updatesOn(TrainingLockEntity)[0]).toEqual([
        TrainingLockEntity,
        { id: 'lock-1' },
        expect.objectContaining({
          status: TrainingLockStatus.RELEASED,
          releasedBy: 'vet-1',
        }),
      ]);
      expect(result.totalCost).toBe(2000000);
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
        (events.publish.mock.calls as Array<[string]>).map(([name]) => name),
      ).toEqual([
        MEDICAL_CASE_CLOSED_EVENT,
        MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
      ]);
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
        (events.publish.mock.calls as Array<[string]>).map(([name]) => name),
      ).toEqual([MEDICAL_CASE_CLOSED_EVENT]);
    });
  });

  describe('adjustCost', () => {
    it('answers conflict for a case still open', async () => {
      await expect(
        service.adjustCost(vet, 'case-1', { totalCost: 10, reason: 'Sai' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('answers not found for a missing case', async () => {
      caseRow = null;
      await expect(
        service.adjustCost(vet, 'case-404', { totalCost: 1, reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('does nothing when the cost is unchanged', async () => {
      caseRow = closedCase;
      await service.adjustCost(vet, 'case-2', {
        totalCost: 1500000,
        reason: 'Kiểm lại',
      });
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('updates the cost, audits the reason and notifies again', async () => {
      caseRow = closedCase;
      const result = await service.adjustCost(vet, 'case-2', {
        totalCost: 150000,
        reason: 'Gõ thừa một số 0',
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: { totalCost: 1500000 },
          after: { totalCost: 150000 },
          reason: 'Gõ thừa một số 0',
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        MEDICAL_CASE_COST_ADJUSTED_EVENT,
        expect.objectContaining({ fromCost: 1500000, toCost: 150000 }),
      );
      expect(result.totalCost).toBe(150000);
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

    it('sums the cost and case count of every horse', async () => {
      casesRepository.costByHorse.mockResolvedValue([
        {
          horseId: 'h1',
          horseName: 'Winx',
          caseCount: 2,
          totalCost: '3000000',
        },
        { horseId: 'h2', horseName: 'Gió', caseCount: 1, totalCost: '500000' },
      ]);
      await expect(
        service.costReport(actorWith(UserRole.CLUB_MANAGER), {
          from: '2026-09-01',
          to: '2026-09-30',
        }),
      ).resolves.toMatchObject({ caseCount: 3, totalCost: 3500000 });
    });
  });
});

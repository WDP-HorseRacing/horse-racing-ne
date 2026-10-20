import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import { HorseMeasurementsService } from '../../horses/horse-measurements/horse-measurements.service';
import { HorseHealthService } from '../../horses/shared/horse-health.service';
import { HorseOwnershipService } from '../../horses/shared/horse-ownership.service';
import { CareScheduleStatus } from '../constants/care-schedule.enum';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import {
  MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
  MEDICAL_VISIT_COST_ADJUSTED_EVENT,
} from '../constants/medical-events.constants';
import {
  MEDICAL_CASE_CANCELLED_EVENT,
  MEDICAL_CASE_OPENED_EVENT,
  MEDICAL_HEALTH_CHANGED_EVENT,
} from '../constants/medical-events.constants';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import { CreateStandaloneVisitDto } from '../dto';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalVisitsService } from './medical-visits.service';
import { CareScheduleWritesService } from '../shared/care-schedule-writes.service';
import { ExamRequestWritesService } from '../shared/exam-request-writes.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';

type Row = Record<string, unknown>;

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };
const HORSE_ID = 'h1';

describe('MedicalVisitsService', () => {
  let steps: string[];
  let horse: Row;
  let rows: Map<unknown, Row | null>;
  let manager: {
    findOne: jest.Mock;
    count: jest.Mock;
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let access: {
    lockHorseForWrite: jest.Mock;
    lockHorseForCostAdjustment: jest.Mock;
    findOpenCase: jest.Mock;
    currentInjuryStatuses: jest.Mock;
  };
  let shared: { findOpenCase: jest.Mock };
  let horseHealth: { applyHealthStatus: jest.Mock };
  let measurements: {
    recordExamMeasurements: jest.Mock;
    voidExamMeasurements: jest.Mock;
    publishAlerts: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let ownerships: { periodsOfHorse: jest.Mock };
  let service: MedicalVisitsService;

  const standalone = (
    overrides: Partial<CreateStandaloneVisitDto> = {},
  ): CreateStandaloneVisitDto => ({
    kind: MedicalVisitKind.ROUTINE,
    conclusion: MedicalVisitConclusion.NORMAL,
    ...overrides,
  });

  const updatesOn = (entity: unknown) =>
    (manager.update.mock.calls as Array<[unknown, unknown, Row]>).filter(
      ([target]) => target === entity,
    );

  const expectWrittenAtCurrentTime = (before: number, after: number) => {
    const timestamps = [
      ...(manager.create.mock.calls as Array<[unknown, Row]>)
        .filter(([entity]) => entity === MedicalRecordEntity)
        .map(([, row]) => row.examDate),
      ...(manager.create.mock.calls as Array<[unknown, Row]>)
        .filter(([entity]) => entity === MedicalCaseEntity)
        .map(([, row]) => row.openedAt),
      ...(
        measurements.recordExamMeasurements.mock.calls as Array<[unknown, Row]>
      ).map(([, input]) => input.measuredAt),
    ];
    expect(timestamps.length).toBeGreaterThan(0);
    for (const value of timestamps) {
      expect(value).toBeInstanceOf(Date);
      const time = (value as Date).getTime();
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(after);
    }
  };

  const expectNothingWritten = () => {
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    steps = [];
    horse = {
      id: HORSE_ID,
      healthStatus: HorseHealthStatus.ELIGIBLE,
      ownerId: 'owner-a',
    };
    rows = new Map();
    let sequence = 0;
    manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(rows.get(entity) ?? null),
      ),
      findOneOrFail: jest.fn((entity: unknown) => {
        const row = rows.get(entity);
        return row
          ? Promise.resolve(row)
          : Promise.reject(new Error('not found'));
      }),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
      save: jest.fn((input: Row | Row[]) =>
        Promise.resolve(
          Array.isArray(input)
            ? input.map((row) => ({ id: `row-${++sequence}`, ...row }))
            : { id: `row-${++sequence}`, ...input },
        ),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      manager,
      transaction: jest.fn(async (work: (m: typeof manager) => unknown) => {
        const result = await work(manager);
        steps.push('commit');
        return result;
      }),
    };
    shared = { findOpenCase: jest.fn().mockResolvedValue(null) };
    access = {
      lockHorseForWrite: jest.fn(() =>
        Promise.resolve({ caller: { id: 'vet-1' }, horse }),
      ),
      lockHorseForCostAdjustment: jest.fn(() =>
        Promise.resolve({ caller: { id: 'vet-1' }, horse }),
      ),
      findOpenCase: shared.findOpenCase,
      currentInjuryStatuses: jest.fn().mockResolvedValue(
        new Map([
          ['inj-open', RecoveryStatus.RECOVERING],
          ['inj-healed', RecoveryStatus.HEALED],
        ]),
      ),
    };
    horseHealth = {
      applyHealthStatus: jest.fn((_m: unknown, input: { to: string }) =>
        Promise.resolve({
          changed: true,
          from: HorseHealthStatus.ELIGIBLE,
          to: input.to,
        }),
      ),
    };
    measurements = {
      recordExamMeasurements: jest.fn().mockResolvedValue([]),
      voidExamMeasurements: jest.fn().mockResolvedValue(2),
      publishAlerts: jest.fn((tx: unknown) => {
        steps.push(tx === manager ? 'alerts' : 'alerts outside tx');
        return Promise.resolve();
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    ownerships = {
      periodsOfHorse: jest.fn().mockResolvedValue([
        {
          ownerId: 'owner-a',
          startedAt: new Date('2026-01-01T00:00:00Z'),
          endedAt: new Date('2026-06-01T00:00:00Z'),
        },
        {
          ownerId: 'owner-b',
          startedAt: new Date('2026-06-01T00:00:00Z'),
          endedAt: null,
        },
      ]),
    };
    events = {
      publish: jest.fn((tx: unknown, name: string) => {
        steps.push(tx === manager ? name : `${name} outside tx`);
        return Promise.resolve();
      }),
    };
    service = new MedicalVisitsService(
      dataSource as unknown as DataSource,
      {
        findOne: (options: unknown) =>
          manager.findOne(MedicalRecordEntity, options) as unknown,
      } as unknown as Repository<MedicalRecordEntity>,
      {
        findOne: (options: unknown) =>
          manager.findOne(MedicalCaseEntity, options) as unknown,
      } as unknown as Repository<MedicalCaseEntity>,
      access as unknown as MedicalAccessService,
      new TrainingLockWritesService(),
      new CareScheduleWritesService(),
      new ExamRequestWritesService(),
      horseHealth as unknown as HorseHealthService,
      measurements as unknown as HorseMeasurementsService,
      audit,
      events,
      ownerships as unknown as HorseOwnershipService,
    );
  });

  describe('createStandaloneVisit', () => {
    it('answers conflict while the horse has an open case and writes nothing', async () => {
      shared.findOpenCase.mockResolvedValue({ id: 'case-1' });
      await expect(
        service.createStandaloneVisit(vet, HORSE_ID, standalone()),
      ).rejects.toThrow(ConflictException);
      expectNothingWritten();
    });

    it('propagates not found for a horse outside the caller scope', async () => {
      access.lockHorseForWrite.mockRejectedValue(new NotFoundException());
      await expect(
        service.createStandaloneVisit(vet, HORSE_ID, standalone()),
      ).rejects.toThrow(NotFoundException);
      expectNothingWritten();
    });

    it('propagates conflict for a transferred horse', async () => {
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.createStandaloneVisit(vet, HORSE_ID, standalone()),
      ).rejects.toThrow(ConflictException);
      expectNothingWritten();
    });

    it('requires an initial diagnosis when the conclusion is ISSUE', async () => {
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({ conclusion: MedicalVisitConclusion.ISSUE }),
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('requires a reason when the health status changes, before any write', async () => {
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({ healthStatus: HorseHealthStatus.INJURED }),
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('requires an end date on every prescription of a visit that opens no case, before any write', async () => {
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({
            prescriptions: [
              {
                medicine: 'Phenylbutazone',
                dosage: '2 g',
                frequency: '1 lần/ngày',
                startDate: '2026-09-27',
              },
            ],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('answers conflict when an attached request is no longer pending', async () => {
      manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === MedicalExamRequestEntity
            ? [
                {
                  id: 'req-1',
                  horseId: HORSE_ID,
                  status: ExamRequestStatus.DISMISSED,
                },
              ]
            : [],
        ),
      );
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({
            kind: MedicalVisitKind.REQUEST,
            requestIds: ['req-1'],
          }),
        ),
      ).rejects.toThrow(ConflictException);
      expectNothingWritten();
    });

    it('records a normal routine visit without opening a case', async () => {
      const result = await service.createStandaloneVisit(
        vet,
        HORSE_ID,
        standalone({
          measurements: [{ type: HorseMeasurementType.WEIGHT, value: 480 }],
        }),
      );

      expect(result).toMatchObject({
        horseId: HORSE_ID,
        kind: MedicalVisitKind.ROUTINE,
        conclusion: MedicalVisitConclusion.NORMAL,
        caseId: null,
        resultingStatus: HorseHealthStatus.ELIGIBLE,
      });
      expect(manager.create).not.toHaveBeenCalledWith(
        MedicalCaseEntity,
        expect.anything(),
      );
      expect(measurements.recordExamMeasurements).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          horseId: HORSE_ID,
          medicalRecordId: result.id,
          feature: 'MED_VISIT',
        }),
      );
      expect(updatesOn(CareScheduleEntity)[0][2]).toMatchObject({
        status: CareScheduleStatus.COMPLETED,
        completedBy: 'vet-1',
      });
      expect(horseHealth.applyHealthStatus).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('records the visit, the opened case and exam measurements at the current time', async () => {
      const before = Date.now();
      await service.createStandaloneVisit(
        vet,
        HORSE_ID,
        standalone({
          conclusion: MedicalVisitConclusion.ISSUE,
          initialDiagnosis: 'Viêm gân chân trước trái',
        }),
      );
      expectWrittenAtCurrentTime(before, Date.now());
    });

    it('opens a case in the same transaction for an ISSUE, attaches the active lock and publishes in the transaction', async () => {
      const result = await service.createStandaloneVisit(
        vet,
        HORSE_ID,
        standalone({
          conclusion: MedicalVisitConclusion.ISSUE,
          initialDiagnosis: 'Viêm gân chân trước trái',
          healthStatus: HorseHealthStatus.INJURED,
          healthReason: 'Sưng gân',
        }),
      );

      expect(manager.create).toHaveBeenCalledWith(
        MedicalCaseEntity,
        expect.objectContaining({
          horseId: HORSE_ID,
          status: MedicalCaseStatus.OPEN,
          initialDiagnosis: 'Viêm gân chân trước trái',
        }),
      );
      expect(result.caseId).toEqual(expect.any(String));
      expect(updatesOn(TrainingLockEntity)[0][2]).toEqual({
        caseId: result.caseId,
      });
      expect(horseHealth.applyHealthStatus).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          to: HorseHealthStatus.INJURED,
          reason: 'Sưng gân',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ entityType: AuditEntityType.MEDICAL_CASE }),
      );
      expect(steps).toEqual([
        'alerts',
        MEDICAL_CASE_OPENED_EVENT,
        MEDICAL_HEALTH_CHANGED_EVENT,
        'commit',
      ]);
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_CASE_OPENED_EVENT,
        expect.objectContaining({ horseId: HORSE_ID, ownerId: 'owner-a' }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_HEALTH_CHANGED_EVENT,
        expect.objectContaining({ horseId: HORSE_ID, ownerId: 'owner-a' }),
      );
    });

    it.each([
      ['the same injury twice', ['inj-open', 'inj-open'], BadRequestException],
      ['an injury of another horse', ['inj-other'], BadRequestException],
      ['a healed injury', ['inj-healed'], ConflictException],
    ])('rejects updating %s in one visit', async (_case, injuryIds, error) => {
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({
            conclusion: MedicalVisitConclusion.ISSUE,
            initialDiagnosis: 'Bong gân',
            injuryUpdates: injuryIds.map((injuryId) => ({
              injuryId,
              recoveryStatus: RecoveryStatus.RECOVERING,
            })),
          }),
        ),
      ).rejects.toThrow(error);
      expect(access.currentInjuryStatuses).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expectNothingWritten();
    });

    it('accepts two new injuries with the same body region and type in one visit', async () => {
      const injury = {
        bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
        injuryType: InjuryType.SPRAIN,
        recoveryStatus: RecoveryStatus.ACUTE,
        position: { x: 0, y: 0, z: 0 },
      };
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({
            conclusion: MedicalVisitConclusion.ISSUE,
            initialDiagnosis: 'Bong gân',
            newInjuries: [injury, injury],
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a prescription ending before it starts', async () => {
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({
            prescriptions: [
              {
                medicine: 'Phenylbutazone',
                dosage: '2 g',
                frequency: '2 lần/ngày',
                startDate: '2026-09-27',
                endDate: '2026-09-20',
              },
            ],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('only replaces a voided visit of the same horse', async () => {
      rows.set(MedicalRecordEntity, {
        id: 'r-old',
        horseId: HORSE_ID,
        voidedAt: null,
      });
      await expect(
        service.createStandaloneVisit(
          vet,
          HORSE_ID,
          standalone({ replacesRecordId: 'r-old' }),
        ),
      ).rejects.toThrow(ConflictException);
      expectNothingWritten();
    });

    it('marks attached pending requests as examined', async () => {
      manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === MedicalExamRequestEntity
            ? [
                {
                  id: 'req-1',
                  horseId: HORSE_ID,
                  status: ExamRequestStatus.PENDING,
                },
              ]
            : [],
        ),
      );
      const result = await service.createStandaloneVisit(
        vet,
        HORSE_ID,
        standalone({ kind: MedicalVisitKind.REQUEST, requestIds: ['req-1'] }),
      );
      expect(updatesOn(MedicalExamRequestEntity)[0][2]).toMatchObject({
        status: ExamRequestStatus.EXAMINED,
        handledBy: 'vet-1',
        medicalRecordId: result.id,
      });
    });

    it('tells each person who asked that the horse was examined, but not the examining vet nor the system', async () => {
      manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === MedicalExamRequestEntity
            ? [
                { id: 'req-1', requestedBy: 'groom-2' },
                { id: 'req-2', requestedBy: null },
                { id: 'req-3', requestedBy: 'vet-1' },
              ].map((request) => ({
                ...request,
                horseId: HORSE_ID,
                status: ExamRequestStatus.PENDING,
                description: 'Đi khập khiễng',
              }))
            : [],
        ),
      );

      await service.createStandaloneVisit(
        vet,
        HORSE_ID,
        standalone({
          kind: MedicalVisitKind.REQUEST,
          requestIds: ['req-1', 'req-2', 'req-3'],
        }),
      );

      const handled = (
        events.publish.mock.calls as Array<[unknown, string, unknown]>
      ).filter(([, name]) => name === MEDICAL_EXAM_REQUEST_HANDLED_EVENT);
      expect(handled.map(([, , payload]) => payload)).toEqual([
        expect.objectContaining({
          requestId: 'req-1',
          requestedBy: 'groom-2',
          outcome: ExamRequestStatus.EXAMINED,
          dismissReason: null,
        }),
      ]);
    });
  });

  describe('createFollowUpVisit', () => {
    beforeEach(() => {
      rows.set(MedicalCaseEntity, {
        id: 'case-1',
        horseId: HORSE_ID,
        status: MedicalCaseStatus.OPEN,
        openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      });
    });

    it('answers not found for a missing case', async () => {
      rows.set(MedicalCaseEntity, null);
      await expect(
        service.createFollowUpVisit(vet, 'case-404', {}),
      ).rejects.toThrow(NotFoundException);
      expectNothingWritten();
    });

    it('answers conflict for a closed case and writes nothing', async () => {
      rows.set(MedicalCaseEntity, {
        id: 'case-1',
        horseId: HORSE_ID,
        status: MedicalCaseStatus.CLOSED,
        openedAt: new Date('2026-09-01T00:00:00Z'),
      });
      await expect(
        service.createFollowUpVisit(vet, 'case-1', {}),
      ).rejects.toThrow(ConflictException);
      expectNothingWritten();
    });

    it.each([
      ['not found for a horse outside the caller scope', NotFoundException],
      ['conflict for a transferred horse', ConflictException],
    ])('propagates %s', async (_label, error) => {
      access.lockHorseForWrite.mockRejectedValue(new error());
      await expect(
        service.createFollowUpVisit(vet, 'case-1', {}),
      ).rejects.toThrow(error);
      expectNothingWritten();
    });

    it('rejects a next visit on a past day', async () => {
      await expect(
        service.createFollowUpVisit(vet, 'case-1', {
          nextVisitAt: new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('requires a reason when the health status changes', async () => {
      await expect(
        service.createFollowUpVisit(vet, 'case-1', {
          healthStatus: HorseHealthStatus.INJURED,
        }),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('records a follow-up visit and its measurements at the current time', async () => {
      const before = Date.now();
      await service.createFollowUpVisit(vet, 'case-1', {
        diagnosis: 'Giảm sưng',
      });
      expectWrittenAtCurrentTime(before, Date.now());
    });

    it('records a follow-up visit in the open case', async () => {
      const result = await service.createFollowUpVisit(vet, 'case-1', {
        diagnosis: 'Giảm sưng',
        nextVisitAt: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(result).toMatchObject({
        caseId: 'case-1',
        kind: MedicalVisitKind.FOLLOW_UP,
        conclusion: null,
      });
      expect(measurements.recordExamMeasurements).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ feature: 'MED_CASE_VISIT' }),
      );
    });
  });

  describe('voidVisit', () => {
    const visit = (overrides: Row = {}) => ({
      id: 'r1',
      horseId: HORSE_ID,
      vetId: 'vet-1',
      caseId: null,
      conclusion: MedicalVisitConclusion.NORMAL,
      voidedAt: null,
      ...overrides,
    });

    it('answers not found for a missing visit', async () => {
      await expect(
        service.voidVisit(vet, 'r404', { reason: 'Sai' }),
      ).rejects.toThrow(NotFoundException);
      expectNothingWritten();
    });

    it('propagates conflict for a transferred horse', async () => {
      rows.set(MedicalRecordEntity, visit());
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.voidVisit(vet, 'r1', { reason: 'Sai' }),
      ).rejects.toThrow(ConflictException);
      expect(measurements.voidExamMeasurements).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('forbids a vet other than the author before the visit rules', async () => {
      rows.set(
        MedicalRecordEntity,
        visit({ vetId: 'vet-2', voidedAt: new Date() }),
      );
      await expect(
        service.voidVisit(vet, 'r1', { reason: 'Sai' }),
      ).rejects.toThrow(
        new ForbiddenException(
          'Chỉ bác sĩ ghi phiếu khám mới được hủy phiếu này',
        ),
      );
      expect(measurements.voidExamMeasurements).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('answers conflict for a visit already voided', async () => {
      rows.set(MedicalRecordEntity, visit({ voidedAt: new Date() }));
      await expect(
        service.voidVisit(vet, 'r1', { reason: 'Sai' }),
      ).rejects.toThrow(ConflictException);
      expect(measurements.voidExamMeasurements).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('refuses to void the opening visit of a closed case', async () => {
      rows.set(
        MedicalRecordEntity,
        visit({ caseId: 'case-1', conclusion: MedicalVisitConclusion.ISSUE }),
      );
      rows.set(MedicalCaseEntity, {
        id: 'case-1',
        status: MedicalCaseStatus.CLOSED,
      });
      await expect(
        service.voidVisit(vet, 'r1', { reason: 'Sai' }),
      ).rejects.toThrow(ConflictException);
      expect(measurements.voidExamMeasurements).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('refuses to void the opening visit while the case has other visits', async () => {
      manager.count.mockResolvedValue(1);
      rows.set(
        MedicalRecordEntity,
        visit({ caseId: 'case-1', conclusion: MedicalVisitConclusion.ISSUE }),
      );
      rows.set(MedicalCaseEntity, {
        id: 'case-1',
        status: MedicalCaseStatus.OPEN,
      });
      await expect(
        service.voidVisit(vet, 'r1', { reason: 'Sai' }),
      ).rejects.toThrow(ConflictException);
      expect(measurements.voidExamMeasurements).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('voids the visit, removes its measurements and audits the reason', async () => {
      rows.set(MedicalRecordEntity, visit());
      const result = await service.voidVisit(vet, 'r1', {
        reason: 'Gõ nhầm cân nặng',
      });
      expect(updatesOn(MedicalRecordEntity)[0][2]).toEqual({
        voidedAt: expect.any(Date) as unknown,
        voidReason: 'Gõ nhầm cân nặng',
      });
      expect(measurements.voidExamMeasurements).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          medicalRecordId: 'r1',
          reason: 'Gõ nhầm cân nặng',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          entityType: AuditEntityType.MEDICAL_RECORD,
          reason: 'Gõ nhầm cân nặng',
        }),
      );
      expect(result.voidReason).toBe('Gõ nhầm cân nặng');
    });

    it('cancels a case opened by mistake when its only visit is voided', async () => {
      rows.set(
        MedicalRecordEntity,
        visit({ caseId: 'case-1', conclusion: MedicalVisitConclusion.ISSUE }),
      );
      rows.set(MedicalCaseEntity, {
        id: 'case-1',
        horseId: HORSE_ID,
        status: MedicalCaseStatus.OPEN,
      });
      await service.voidVisit(vet, 'r1', { reason: 'Mở nhầm ngựa' });
      expect(updatesOn(MedicalCaseEntity)[0][2]).toEqual({
        status: MedicalCaseStatus.CANCELLED,
      });
      expect(updatesOn(TrainingLockEntity)[0]).toEqual([
        TrainingLockEntity,
        { caseId: 'case-1' },
        { caseId: null },
      ]);
      expect(steps).toEqual([MEDICAL_CASE_CANCELLED_EVENT, 'commit']);
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_CASE_CANCELLED_EVENT,
        expect.objectContaining({ caseId: 'case-1', ownerId: 'owner-a' }),
      );
    });

    it('voids a follow-up visit of a closed case', async () => {
      rows.set(
        MedicalRecordEntity,
        visit({ caseId: 'case-1', conclusion: null }),
      );
      rows.set(MedicalCaseEntity, {
        id: 'case-1',
        status: MedicalCaseStatus.CLOSED,
      });
      await service.voidVisit(vet, 'r1', { reason: 'Nhập 30.5 độ' });
      expect(measurements.voidExamMeasurements).toHaveBeenCalled();
      expect(updatesOn(MedicalCaseEntity)).toHaveLength(0);
    });
  });

  describe('adjustVisitCost', () => {
    const visit = (overrides: Row = {}) => ({
      id: 'r1',
      horseId: HORSE_ID,
      caseId: 'case-1',
      kind: MedicalVisitKind.FOLLOW_UP,
      examDate: new Date('2026-05-20T03:00:00Z'),
      cost: '15000000',
      voidedAt: null,
      ...overrides,
    });
    const adjust = (cost = 1500000) =>
      service.adjustVisitCost(vet, 'r1', { cost, reason: 'Gõ thừa số 0' });

    it('answers not found for a missing visit', async () => {
      await expect(adjust()).rejects.toThrow(NotFoundException);
      expectNothingWritten();
    });

    it.each([
      ['not found for a horse outside the caller scope', NotFoundException],
      ['forbidden for an inactive account', ForbiddenException],
      [
        'conflict for a deleted profile seen by a Club Manager',
        ConflictException,
      ],
    ])('propagates %s', async (_label, error) => {
      rows.set(MedicalRecordEntity, visit());
      access.lockHorseForCostAdjustment.mockRejectedValue(new error());
      await expect(adjust()).rejects.toThrow(error);
      expectNothingWritten();
    });

    it('answers conflict for a voided visit', async () => {
      rows.set(MedicalRecordEntity, visit({ voidedAt: new Date() }));
      await expect(adjust()).rejects.toThrow(ConflictException);
      expectNothingWritten();
    });

    it('writes nothing and tells nobody when the cost is unchanged', async () => {
      rows.set(MedicalRecordEntity, visit());
      await expect(adjust(15000000)).resolves.toMatchObject({
        cost: 15000000,
      });
      expectNothingWritten();
    });

    it('locks the horse then the visit, audits before and after with the reason and tells the owner of the exam date period', async () => {
      rows.set(MedicalRecordEntity, visit());

      const result = await adjust();

      expect(access.lockHorseForCostAdjustment).toHaveBeenCalledWith(
        manager,
        vet,
        HORSE_ID,
      );
      expect(access.lockHorseForWrite).not.toHaveBeenCalled();
      expect(manager.findOneOrFail).toHaveBeenCalledWith(MedicalRecordEntity, {
        where: { id: 'r1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(updatesOn(MedicalRecordEntity)).toEqual([
        [MedicalRecordEntity, { id: 'r1' }, { cost: '1500000' }],
      ]);
      expect(audit.record).toHaveBeenCalledWith(manager, {
        actorId: 'vet-1',
        action: 'UPDATE',
        entityType: AuditEntityType.MEDICAL_RECORD,
        entityId: 'r1',
        before: { cost: 15000000 },
        after: { cost: 1500000 },
        reason: 'Gõ thừa số 0',
        feature: 'MED_CASE_VISIT',
      });
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_VISIT_COST_ADJUSTED_EVENT,
        {
          eventId: expect.any(String) as unknown,
          horseId: HORSE_ID,
          recordId: 'r1',
          caseId: 'case-1',
          examDate: '2026-05-20T03:00:00.000Z',
          fromCost: 15000000,
          toCost: 1500000,
          costOwnerId: 'owner-a',
        },
      );
      expect(steps).toEqual([MEDICAL_VISIT_COST_ADJUSTED_EVENT, 'commit']);
      expect(result).toMatchObject({ cost: 1500000, costHidden: false });
    });

    it('audits a visit outside any case with the standalone visit feature and names no owner when the horse had none', async () => {
      rows.set(
        MedicalRecordEntity,
        visit({
          caseId: null,
          kind: MedicalVisitKind.ROUTINE,
          examDate: new Date('2025-12-31T00:00:00Z'),
        }),
      );
      await adjust();
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ feature: 'MED_VISIT' }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_VISIT_COST_ADJUSTED_EVENT,
        expect.objectContaining({ caseId: null, costOwnerId: null }),
      );
    });
  });
});

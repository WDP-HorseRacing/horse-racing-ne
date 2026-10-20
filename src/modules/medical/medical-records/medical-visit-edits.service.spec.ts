import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseMeasurementsService } from '../../horses/horse-measurements/horse-measurements.service';
import { HorseHealthService } from '../../horses/shared/horse-health.service';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalVisitEditsService } from './medical-visit-edits.service';
import { MedicalVisitWritesService } from './medical-visit-writes.service';

type Row = Record<string, unknown>;

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };

describe('MedicalVisitEditsService', () => {
  let visit: Row | null;
  let manager: {
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let access: { lockHorseForWrite: jest.Mock };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let service: MedicalVisitEditsService;

  const edit = (body: Row = { reason: 'Gõ nhầm', diagnosis: 'Viêm gân' }) =>
    service.editVisit(vet, 'r1', body as never);

  const expectNothingWritten = () => {
    expect(manager.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    visit = {
      id: 'r1',
      horseId: 'h1',
      vetId: 'vet-1',
      caseId: null,
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      diagnosis: 'Viêm gân',
      careInstructions: null,
      nextVisitAt: null,
      resultingStatus: HorseHealthStatus.ELIGIBLE,
      examDate: new Date('2026-10-01T03:00:00Z'),
      voidedAt: null,
      cost: '0',
    };
    manager = {
      findOneOrFail: jest.fn(() =>
        visit ? Promise.resolve(visit) : Promise.reject(new Error('none')),
      ),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    access = {
      lockHorseForWrite: jest.fn(() =>
        Promise.resolve({
          caller: { id: 'vet-1' },
          horse: { id: 'h1', healthStatus: HorseHealthStatus.ELIGIBLE },
        }),
      ),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new MedicalVisitEditsService(
      {
        transaction: (work: (m: typeof manager) => unknown) => work(manager),
      } as unknown as DataSource,
      {
        findOne: () => Promise.resolve(visit),
      } as unknown as Repository<MedicalRecordEntity>,
      access as unknown as MedicalAccessService,
      {
        publishHealthChanged: jest.fn(),
      } as unknown as MedicalVisitWritesService,
      { applyHealthStatus: jest.fn() } as unknown as HorseHealthService,
      {} as HorseMeasurementsService,
      audit,
      events,
    );
  });

  it('answers bad request for an edit with nothing but a reason, before reading anything', async () => {
    await expect(edit({ reason: 'x' })).rejects.toThrow(BadRequestException);
    expect(access.lockHorseForWrite).not.toHaveBeenCalled();
  });

  it('answers not found for a missing visit', async () => {
    visit = null;
    await expect(edit()).rejects.toThrow(NotFoundException);
    expectNothingWritten();
  });

  it('propagates conflict for a transferred or deceased horse', async () => {
    access.lockHorseForWrite.mockRejectedValue(new ConflictException());
    await expect(edit()).rejects.toThrow(ConflictException);
    expectNothingWritten();
  });

  it('forbids a vet other than the author before the voided visit rule', async () => {
    visit = { ...visit, vetId: 'vet-2', voidedAt: new Date() };
    await expect(edit()).rejects.toThrow(
      new ForbiddenException(
        'Chỉ bác sĩ ghi phiếu khám mới được sửa phiếu này',
      ),
    );
    expectNothingWritten();
  });

  it('answers conflict for a voided visit', async () => {
    visit = { ...visit, voidedAt: new Date() };
    await expect(edit()).rejects.toThrow(ConflictException);
    expectNothingWritten();
  });

  it('answers bad request when a follow-up visit gets a conclusion', async () => {
    visit = { ...visit, kind: MedicalVisitKind.FOLLOW_UP, caseId: null };
    await expect(
      edit({ reason: 'x', conclusion: MedicalVisitConclusion.ISSUE }),
    ).rejects.toThrow(BadRequestException);
    expectNothingWritten();
  });

  it('writes no audit and no event when nothing changes', async () => {
    const result = await edit({
      reason: 'Kiểm lại',
      diagnosis: 'Viêm gân',
      healthStatus: HorseHealthStatus.ELIGIBLE,
    });
    expectNothingWritten();
    expect(result).toMatchObject({ healthOutcome: 'UNCHANGED' });
  });

  it('updates a changed text field and audits only the change with the reason', async () => {
    await edit({
      reason: 'Gõ nhầm',
      diagnosis: 'Viêm khớp',
      careInstructions: null,
    });
    expect(manager.update).toHaveBeenCalledWith(
      MedicalRecordEntity,
      { id: 'r1' },
      { diagnosis: 'Viêm khớp' },
    );
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        entityId: 'r1',
        before: { diagnosis: 'Viêm gân' },
        after: { diagnosis: 'Viêm khớp' },
        reason: 'Gõ nhầm',
        feature: 'MED_VISIT',
      }),
    );
  });
});

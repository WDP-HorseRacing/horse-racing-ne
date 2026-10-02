import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../horses/enums/horse-measurement-alert.enum';
import { HORSE_MEASUREMENT_SPECS } from '../../horses/constants/horse.constants';
import { HorseMeasurementSource } from '../../horses/enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorsesSharedRepository } from '../../horses/shared/horses-shared.repository';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../constants/exam-request.enum';
import { MEDICAL_EXAM_REQUEST_URGENT_EVENT } from '../constants/medical-events.constants';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { ExamRequestsService } from './exam-requests.service';
import { MeasurementAlertExamRequestListener } from './measurement-alert.listener';

type Row = Record<string, unknown>;

const actorWith = (...roles: UserRole[]): Actor => ({
  sub: `kc-${roles.join('-')}`,
  roles,
});
const HORSE = { id: 'h1', name: 'Winx' };

describe('ExamRequestsService', () => {
  let requestRow: Row | null;
  let horseRow: Row | null;
  let insertResult: { raw: Array<{ id: string }> };
  let insertBuilder: Record<string, jest.Mock>;
  let manager: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let requests: { findOne: jest.Mock; find: jest.Mock };
  let access: { lockHorseForWrite: jest.Mock };
  let horseAccess: {
    currentUser: jest.Mock;
    findReadableHorseForActor: jest.Mock;
    isHorseInTrainerBarn: jest.Mock;
    lockWritableHorseInScope: jest.Mock;
    assertNotTransferred: jest.Mock;
  };
  let horses: { isGroomAssigned: jest.Mock; assignedHorseIds: jest.Mock };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let service: ExamRequestsService;

  const alertEvent = (
    overrides: Partial<HorseMeasurementAlertEvent> = {},
  ): HorseMeasurementAlertEvent =>
    ({
      alert: HorseMeasurementAlert.FEVER,
      severity: HorseMeasurementAlertSeverity.URGENT,
      measurementId: 'm1',
      horseId: 'h1',
      measuredBy: 'groom-1',
      type: HorseMeasurementType.TEMPERATURE,
      value: 39.2,
      unit: HORSE_MEASUREMENT_SPECS[HorseMeasurementType.TEMPERATURE].unit,
      measuredAt: new Date(),
      source: HorseMeasurementSource.MANUAL,
      ...overrides,
    }) as HorseMeasurementAlertEvent;

  beforeEach(() => {
    requestRow = {
      id: 'req-1',
      horseId: 'h1',
      status: ExamRequestStatus.PENDING,
      urgent: false,
      source: ExamRequestSource.STAFF,
      description: 'Đi khập khiễng',
    };
    horseRow = {
      id: 'h1',
      deletedAt: null,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    };
    insertResult = { raw: [{ id: 'req-auto' }] };
    insertBuilder = {};
    for (const step of ['insert', 'into', 'values', 'orIgnore', 'returning']) {
      insertBuilder[step] = jest.fn(() => insertBuilder);
    }
    insertBuilder.execute = jest.fn(() => Promise.resolve(insertResult));
    manager = {
      findOne: jest.fn(() => Promise.resolve(horseRow)),
      findOneOrFail: jest.fn(() => Promise.resolve({ ...requestRow })),
      create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
      save: jest.fn((row: Row) => Promise.resolve({ id: 'req-new', ...row })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => insertBuilder),
    };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => unknown) =>
        work(manager),
      ),
    };
    requests = {
      findOne: jest.fn(() => Promise.resolve(requestRow)),
      find: jest.fn().mockResolvedValue([]),
    };
    access = {
      lockHorseForWrite: jest.fn().mockResolvedValue({
        caller: { id: 'user-1' },
        horse: HORSE,
      }),
    };
    horseAccess = {
      currentUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
      findReadableHorseForActor: jest.fn().mockResolvedValue(HORSE),
      isHorseInTrainerBarn: jest.fn().mockResolvedValue(false),
      lockWritableHorseInScope: jest.fn().mockResolvedValue({
        caller: { id: 'user-1' },
        horse: HORSE,
      }),
      assertNotTransferred: jest.fn(),
    };
    horses = {
      isGroomAssigned: jest.fn().mockResolvedValue(false),
      assignedHorseIds: jest.fn().mockResolvedValue([]),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn() };
    service = new ExamRequestsService(
      dataSource as unknown as DataSource,
      requests as unknown as Repository<MedicalExamRequestEntity>,
      access as unknown as MedicalAccessService,
      horseAccess as unknown as HorseAccessService,
      horses as unknown as HorsesSharedRepository,
      audit,
      events as unknown as DomainEventPublisher,
    );
  });

  describe('create', () => {
    const body = { description: 'Đi khập khiễng', urgent: true };

    it('rejects a head trainer outside the barn with 403 and saves nothing', async () => {
      await expect(
        service.create(actorWith(UserRole.HEAD_TRAINER), 'h1', body),
      ).rejects.toThrow(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('rejects a groom not assigned to the horse with 403', async () => {
      await expect(
        service.create(actorWith(UserRole.GROOM), 'h1', body),
      ).rejects.toThrow(ForbiddenException);
      expect(horses.isGroomAssigned).toHaveBeenCalledWith(
        'h1',
        'user-1',
        manager,
      );
    });

    it('propagates conflict for a transferred horse', async () => {
      horseAccess.assertNotTransferred.mockImplementation(() => {
        throw new ConflictException();
      });
      await expect(
        service.create(actorWith(UserRole.CLUB_MANAGER), 'h1', body),
      ).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('propagates not found for a horse outside the caller scope', async () => {
      horseAccess.lockWritableHorseInScope.mockRejectedValue(new NotFoundException());
      await expect(
        service.create(actorWith(UserRole.CLUB_MANAGER), 'h9', body),
      ).rejects.toThrow(NotFoundException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('answers 403, not 409, to a groom outside scope on a transferred horse', async () => {
      horseAccess.assertNotTransferred.mockImplementation(() => {
        throw new ConflictException();
      });
      await expect(
        service.create(actorWith(UserRole.GROOM), 'h1', body),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an assigned groom send an urgent request and alerts veterinarians after commit', async () => {
      horses.isGroomAssigned.mockResolvedValue(true);
      const result = await service.create(
        actorWith(UserRole.GROOM),
        'h1',
        body,
      );
      expect(result).toMatchObject({
        horseName: 'Winx',
        source: ExamRequestSource.GROOM_INCIDENT,
        status: ExamRequestStatus.PENDING,
        urgent: true,
      });
      expect(events.publish).toHaveBeenCalledWith(
        MEDICAL_EXAM_REQUEST_URGENT_EVENT,
        expect.objectContaining({ requestId: 'req-new', horseId: 'h1' }),
      );
    });

    it('does not alert for a normal request from a head trainer of the barn', async () => {
      horseAccess.isHorseInTrainerBarn.mockResolvedValue(true);
      const result = await service.create(
        actorWith(UserRole.HEAD_TRAINER),
        'h1',
        { description: 'Mệt' },
      );
      expect(result.source).toBe(ExamRequestSource.STAFF);
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns an empty page to a groom without assigned horses', async () => {
      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
      };
      (
        requests as unknown as { createQueryBuilder: jest.Mock }
      ).createQueryBuilder = jest.fn(() => qb);
      const page = await service.list(actorWith(UserRole.GROOM), {
        page: 1,
        limit: 20,
        skip: 0,
      } as never);
      expect(page.items).toEqual([]);
      expect(page.meta.total).toBe(0);
    });

    it('limits a groom to the requests of assigned horses', async () => {
      horses.assignedHorseIds.mockResolvedValue(['h1', 'h2']);
      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      (
        requests as unknown as { createQueryBuilder: jest.Mock }
      ).createQueryBuilder = jest.fn(() => qb);
      await service.list(actorWith(UserRole.GROOM), {
        page: 1,
        limit: 20,
        skip: 0,
      } as never);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'request.horseId IN (:...horseIds)',
        { horseIds: ['h1', 'h2'] },
      );
    });
  });

  describe('listByHorse', () => {
    it('rejects a groom not assigned to the horse with 403', async () => {
      await expect(
        service.listByHorse(actorWith(UserRole.GROOM), 'h1'),
      ).rejects.toThrow(ForbiddenException);
      expect(requests.find).not.toHaveBeenCalled();
    });

    it('answers not found for a horse outside the caller scope', async () => {
      horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
      await expect(
        service.listByHorse(actorWith(UserRole.VETERINARIAN), 'h9'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('dismiss', () => {
    const vet = actorWith(UserRole.VETERINARIAN);

    it('answers not found for a missing request', async () => {
      requestRow = null;
      await expect(
        service.dismiss(vet, 'req-404', { reason: 'Nhầm' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('answers conflict for a request already handled', async () => {
      requestRow = { ...requestRow, status: ExamRequestStatus.EXAMINED };
      await expect(
        service.dismiss(vet, 'req-1', { reason: 'Nhầm' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred horse', async () => {
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.dismiss(vet, 'req-1', { reason: 'Nhầm' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('dismisses a pending request with the reason and audits it', async () => {
      const result = await service.dismiss(vet, 'req-1', {
        reason: 'Groom báo nhầm ngựa',
      });
      expect(manager.update).toHaveBeenCalledWith(
        MedicalExamRequestEntity,
        { id: 'req-1' },
        expect.objectContaining({
          status: ExamRequestStatus.DISMISSED,
          dismissReason: 'Groom báo nhầm ngựa',
          handledBy: 'user-1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ reason: 'Groom báo nhầm ngựa' }),
      );
      expect(result.status).toBe(ExamRequestStatus.DISMISSED);
    });
  });

  describe('updateUrgency', () => {
    const vet = actorWith(UserRole.VETERINARIAN);

    it('answers conflict for a request already handled', async () => {
      requestRow = { ...requestRow, status: ExamRequestStatus.DISMISSED };
      await expect(
        service.updateUrgency(vet, 'req-1', { urgent: true, reason: 'x' }),
      ).rejects.toThrow(ConflictException);
    });

    it('does nothing when the urgency is unchanged', async () => {
      await service.updateUrgency(vet, 'req-1', {
        urgent: false,
        reason: 'x',
      });
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('answers not found for a missing request', async () => {
      requestRow = null;
      await expect(
        service.updateUrgency(vet, 'req-404', { urgent: true, reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates conflict for a transferred horse', async () => {
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.updateUrgency(vet, 'req-1', { urgent: true, reason: 'x' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('alerts veterinarians when an automatic request is raised to urgent', async () => {
      requestRow = {
        ...requestRow,
        source: ExamRequestSource.MEASUREMENT_ALERT,
        requestedBy: null,
      };
      const result = await service.updateUrgency(vet, 'req-1', {
        urgent: true,
        reason: 'Sụt cân nhanh',
      });
      expect(events.publish).toHaveBeenCalledWith(
        MEDICAL_EXAM_REQUEST_URGENT_EVENT,
        expect.objectContaining({ requestId: 'req-1' }),
      );
      expect(result.requestedBySystem).toBe(true);
    });

    it('raises the request to urgent, audits the reason and alerts veterinarians', async () => {
      await service.updateUrgency(vet, 'req-1', {
        urgent: true,
        reason: 'Sưng nặng hơn',
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: { urgent: false },
          after: { urgent: true },
          reason: 'Sưng nặng hơn',
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        MEDICAL_EXAM_REQUEST_URGENT_EVENT,
        expect.objectContaining({ requestId: 'req-1' }),
      );
    });
  });

  describe('createFromAlert', () => {
    it('creates an urgent system request for a fever and audits it without an actor', async () => {
      await expect(service.createFromAlert(alertEvent())).resolves.toBe(true);
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          requestedBy: null,
          source: ExamRequestSource.MEASUREMENT_ALERT,
          urgent: true,
          alertType: HorseMeasurementAlert.FEVER,
          description: 'Cảnh báo tự động: sốt, thân nhiệt 39.2 °C',
        }),
      );
      expect(insertBuilder.orIgnore).toHaveBeenCalled();
      expect(manager.findOne).toHaveBeenCalledWith(
        HorseEntity,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ actorId: null, entityId: 'req-auto' }),
      );
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('creates a normal request for a weight drop', async () => {
      await service.createFromAlert(
        alertEvent({
          alert: HorseMeasurementAlert.WEIGHT_DROP,
          severity: HorseMeasurementAlertSeverity.WARNING,
          baselineValue: 500,
          dropPercent: 6,
          type: HorseMeasurementType.WEIGHT,
          value: 470,
          unit: HORSE_MEASUREMENT_SPECS[HorseMeasurementType.WEIGHT].unit,
        }),
      );
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          urgent: false,
          description: 'Cảnh báo tự động: giảm 6% cân nặng (còn 470 kg)',
        }),
      );
    });

    it('skips a duplicate while an automatic request of the same alert is pending', async () => {
      insertResult = { raw: [] };
      await expect(service.createFromAlert(alertEvent())).resolves.toBe(false);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
      ['transferred', { lifecycleStatus: HorseLifecycleStatus.TRANSFERRED }],
      ['deleted', { deletedAt: new Date() }],
    ])('skips a %s horse', async (_label, overrides) => {
      horseRow = { ...horseRow, ...overrides };
      await expect(service.createFromAlert(alertEvent())).resolves.toBe(false);
      expect(insertBuilder.execute).not.toHaveBeenCalled();
    });
  });

  describe('MeasurementAlertExamRequestListener', () => {
    it('ignores alerts from measurements taken during an exam', async () => {
      const spy = jest.spyOn(service, 'createFromAlert');
      await new MeasurementAlertExamRequestListener(service).handle(
        alertEvent({ source: HorseMeasurementSource.MEDICAL_EXAM }),
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it('swallows a failure because the measurement is already committed', async () => {
      jest
        .spyOn(service, 'createFromAlert')
        .mockRejectedValue(new Error('db down'));
      await expect(
        new MeasurementAlertExamRequestListener(service).handle(alertEvent()),
      ).resolves.toBeUndefined();
    });
  });
});

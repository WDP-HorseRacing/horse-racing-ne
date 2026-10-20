import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../constants/exam-request.enum';
import {
  MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
  MEDICAL_EXAM_REQUEST_URGENT_EVENT,
} from '../constants/medical-events.constants';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { ExamRequestsService } from './exam-requests.service';

type Row = Record<string, unknown>;

const actorWith = (...roles: UserRole[]): Actor => ({
  sub: `kc-${roles.join('-')}`,
  roles,
});
const HORSE = { id: 'h1', name: 'Winx' };

describe('ExamRequestsService', () => {
  let requestRow: Row | null;
  let manager: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let requests: { findOne: jest.Mock; find: jest.Mock };
  let access: { lockHorseForWrite: jest.Mock };
  let horseAccess: {
    currentUser: jest.Mock;
    findReadableHorseForActor: jest.Mock;
    isHorseInTrainerBarn: jest.Mock;
    lockWritableHorseInScope: jest.Mock;
    isGroomAssigned: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let service: ExamRequestsService;

  beforeEach(() => {
    requestRow = {
      id: 'req-1',
      horseId: 'h1',
      status: ExamRequestStatus.PENDING,
      urgent: false,
      source: ExamRequestSource.STAFF,
      description: 'Đi khập khiễng',
    };
    manager = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn(() => Promise.resolve({ ...requestRow })),
      create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
      save: jest.fn((row: Row) => Promise.resolve({ id: 'req-new', ...row })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
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
      isGroomAssigned: jest.fn().mockResolvedValue(false),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new ExamRequestsService(
      dataSource as unknown as DataSource,
      requests as unknown as Repository<MedicalExamRequestEntity>,
      access as unknown as MedicalAccessService,
      horseAccess as unknown as HorseAccessService,
      audit,
      events,
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

    it('rejects a groom with 403, even one assigned to the horse', async () => {
      horseAccess.isGroomAssigned.mockResolvedValue(true);
      await expect(
        service.create(actorWith(UserRole.GROOM), 'h1', body),
      ).rejects.toThrow(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred horse', async () => {
      horseAccess.lockWritableHorseInScope.mockResolvedValue({
        caller: { id: 'user-1' },
        horse: { ...HORSE, lifecycleStatus: HorseLifecycleStatus.TRANSFERRED },
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
      horseAccess.lockWritableHorseInScope.mockResolvedValue({
        caller: { id: 'user-1' },
        horse: { ...HORSE, lifecycleStatus: HorseLifecycleStatus.TRANSFERRED },
      });
      await expect(
        service.create(actorWith(UserRole.GROOM), 'h1', body),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a head trainer of the barn send an urgent request and alerts veterinarians in the transaction', async () => {
      horseAccess.isHorseInTrainerBarn.mockResolvedValue(true);
      const result = await service.create(
        actorWith(UserRole.HEAD_TRAINER),
        'h1',
        body,
      );
      expect(result).toMatchObject({
        horseName: 'Winx',
        source: ExamRequestSource.STAFF,
        status: ExamRequestStatus.PENDING,
        urgent: true,
      });
      expect(events.publish).toHaveBeenCalledWith(
        manager,
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
      manager.find.mockResolvedValue([{ horseId: 'h1' }, { horseId: 'h2' }]);
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
      expect(manager.find).toHaveBeenCalledWith(GroomAssignmentEntity, {
        where: { groomId: 'user-1', endAt: IsNull() },
        select: { horseId: true },
      });
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

    it('tells the person who asked why the request was skipped', async () => {
      requestRow = { ...requestRow, requestedBy: 'groom-2' };

      await service.dismiss(vet, 'req-1', { reason: 'Đã khám sáng nay' });

      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
        expect.objectContaining({
          requestId: 'req-1',
          requestedBy: 'groom-2',
          outcome: ExamRequestStatus.DISMISSED,
          dismissReason: 'Đã khám sáng nay',
        }),
      );
    });

    it.each([
      ['raised by the system', null],
      ['raised by the same vet', 'user-1'],
    ])('tells nobody when the request was %s', async (_case, requestedBy) => {
      requestRow = { ...requestRow, requestedBy };

      await service.dismiss(vet, 'req-1', { reason: 'Nhầm' });

      expect(events.publish).not.toHaveBeenCalled();
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
        manager,
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
        manager,
        MEDICAL_EXAM_REQUEST_URGENT_EVENT,
        expect.objectContaining({ requestId: 'req-1' }),
      );
    });
  });
});

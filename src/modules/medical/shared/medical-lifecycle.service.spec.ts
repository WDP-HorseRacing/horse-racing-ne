import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import {
  DECEASED_CANCEL_REASON,
  OPEN_CASE_BLOCKS_DECEASED_MESSAGE,
  OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
  TRANSFER_CANCEL_REASON,
} from '../constants/medical.constants';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalLifecycleService } from './medical-lifecycle.service';
import { MedicalAccessService } from './medical-access.service';
import { CareScheduleWritesService } from './care-schedule-writes.service';
import { ExamRequestWritesService } from './exam-request-writes.service';

describe('MedicalLifecycleService', () => {
  const now = new Date('2026-09-27T08:00:00Z');
  let shared: { findOpenCase: jest.Mock };
  let requestsUpdate: jest.Mock;
  let schedulesUpdate: jest.Mock;
  let manager: EntityManager;
  let service: MedicalLifecycleService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    shared = { findOpenCase: jest.fn().mockResolvedValue(null) };
    requestsUpdate = jest.fn().mockResolvedValue({ affected: 2 });
    schedulesUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    manager = {
      count: jest.fn((entity) =>
        Promise.resolve(entity === MedicalExamRequestEntity ? 3 : 2),
      ),
      getRepository: jest.fn((entity) =>
        entity === MedicalExamRequestEntity
          ? { update: requestsUpdate }
          : entity === CareScheduleEntity
            ? { update: schedulesUpdate }
            : undefined,
      ),
    } as unknown as EntityManager;
    service = new MedicalLifecycleService(
      shared as unknown as MedicalAccessService,
      new ExamRequestWritesService(),
      new CareScheduleWritesService(),
      { manager } as unknown as DataSource,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('settleBeforeReadOnly', () => {
    it('answers conflict while the horse has an open case, without writing', async () => {
      shared.findOpenCase.mockResolvedValue({ id: 'case-1' });

      await expect(
        service.settleBeforeReadOnly(
          manager,
          'h1',
          HorseLifecycleStatus.TRANSFERRED,
        ),
      ).rejects.toThrow(
        new ConflictException(OPEN_CASE_BLOCKS_TRANSFER_MESSAGE),
      );
      expect(requestsUpdate).not.toHaveBeenCalled();
      expect(schedulesUpdate).not.toHaveBeenCalled();
    });

    it('dismisses pending exam requests and cancels open schedules through the given manager', async () => {
      const result = await service.settleBeforeReadOnly(
        manager,
        'h1',
        HorseLifecycleStatus.TRANSFERRED,
      );

      expect(shared.findOpenCase).toHaveBeenCalledWith('h1', manager);
      expect(requestsUpdate).toHaveBeenCalledWith(
        { horseId: 'h1', status: ExamRequestStatus.PENDING },
        {
          status: ExamRequestStatus.DISMISSED,
          dismissReason: TRANSFER_CANCEL_REASON,
          handledBy: null,
          handledAt: now,
        },
      );
      expect(schedulesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ horseId: 'h1' }),
        {
          status: CareScheduleStatus.CANCELLED,
          cancelReason: TRANSFER_CANCEL_REASON,
        },
      );
      expect(result).toEqual({
        examRequestsDismissed: 2,
        careSchedulesCancelled: 1,
      });
    });
  });

  describe('readOnlyBlockReason', () => {
    it('returns null when the horse has no open case', async () => {
      await expect(
        service.readOnlyBlockReason('h1', HorseLifecycleStatus.TRANSFERRED),
      ).resolves.toBeNull();
    });

    it('returns the blocking message when the horse has an open case', async () => {
      shared.findOpenCase.mockResolvedValue({ id: 'case-1' });

      await expect(
        service.readOnlyBlockReason('h1', HorseLifecycleStatus.TRANSFERRED),
      ).resolves.toBe(OPEN_CASE_BLOCKS_TRANSFER_MESSAGE);
    });
  });

  describe('recording a death', () => {
    it('uses the death message and cancel reason', async () => {
      await service.settleBeforeReadOnly(
        manager,
        'h1',
        HorseLifecycleStatus.DECEASED,
      );
      expect(requestsUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dismissReason: DECEASED_CANCEL_REASON }),
      );
      expect(schedulesUpdate).toHaveBeenCalledWith(expect.anything(), {
        status: CareScheduleStatus.CANCELLED,
        cancelReason: DECEASED_CANCEL_REASON,
      });
    });

    it('blocks with the death message while a case is open', async () => {
      shared.findOpenCase.mockResolvedValue({ id: 'case-1' });
      await expect(
        service.readOnlyBlockReason('h1', HorseLifecycleStatus.DECEASED),
      ).resolves.toBe(OPEN_CASE_BLOCKS_DECEASED_MESSAGE);
    });
  });

  describe('readOnlyImpact', () => {
    it('counts pending exam requests and scheduled care tasks', async () => {
      await expect(service.readOnlyImpact('h1', manager)).resolves.toEqual({
        examRequestsToDismiss: 3,
        careSchedulesToCancel: 2,
      });
    });
  });
});

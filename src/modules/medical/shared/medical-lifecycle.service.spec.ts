import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CareScheduleStatus } from '../constants/care-schedule.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import {
  OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
  TRANSFER_CANCEL_REASON,
} from '../constants/medical.constants';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalLifecycleService } from './medical-lifecycle.service';
import { MedicalAccessService } from './medical-access.service';

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
      { manager } as unknown as DataSource,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('settleForTransfer', () => {
    it('answers conflict while the horse has an open case, without writing', async () => {
      shared.findOpenCase.mockResolvedValue({ id: 'case-1' });

      await expect(service.settleForTransfer(manager, 'h1')).rejects.toThrow(
        new ConflictException(OPEN_CASE_BLOCKS_TRANSFER_MESSAGE),
      );
      expect(requestsUpdate).not.toHaveBeenCalled();
      expect(schedulesUpdate).not.toHaveBeenCalled();
    });

    it('dismisses pending exam requests and cancels open schedules through the given manager', async () => {
      const result = await service.settleForTransfer(manager, 'h1');

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

  describe('transferBlockReason', () => {
    it('returns null when the horse has no open case', async () => {
      await expect(service.transferBlockReason('h1')).resolves.toBeNull();
    });

    it('returns the blocking message when the horse has an open case', async () => {
      shared.findOpenCase.mockResolvedValue({ id: 'case-1' });

      await expect(service.transferBlockReason('h1')).resolves.toBe(
        OPEN_CASE_BLOCKS_TRANSFER_MESSAGE,
      );
    });
  });

  describe('transferImpact', () => {
    it('counts pending exam requests and scheduled care tasks', async () => {
      await expect(service.transferImpact('h1', manager)).resolves.toEqual({
        examRequestsToDismiss: 3,
        careSchedulesToCancel: 2,
      });
    });
  });
});

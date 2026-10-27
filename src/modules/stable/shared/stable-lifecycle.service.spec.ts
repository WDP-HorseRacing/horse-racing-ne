import { EntityManager, FindOperator } from 'typeorm';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { FeedingPlanEntity } from '../entities/feeding-plan.entity';
import { HorseCareTaskEntity } from '../entities/horse-care-task.entity';
import { StableLifecycleService } from './stable-lifecycle.service';

const HORSE_ID = 'h1';
const TODAY = '2026-10-19';

type Where = Record<string, unknown>;

const operator = (value: unknown) => {
  const op = value as FindOperator<unknown>;
  return { type: op.type, value: op.value };
};

describe('StableLifecycleService', () => {
  let manager: {
    update: jest.Mock;
    delete: jest.Mock;
    countBy: jest.Mock;
  };
  let service: StableLifecycleService;

  const callFor = (mock: jest.Mock, entity: unknown) =>
    (mock.mock.calls as unknown[][]).filter((call) => call[0] === entity) as [
      unknown,
      Where,
      Where?,
    ][];

  beforeEach(() => {
    manager = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      countBy: jest.fn().mockResolvedValue(0),
    };
    service = new StableLifecycleService();
  });

  describe('settleBeforeReadOnly', () => {
    const settle = () =>
      service.settleBeforeReadOnly(
        manager as unknown as EntityManager,
        HORSE_ID,
        TODAY,
      );

    it('archives the ACTIVE feeding plan with its end time and deletes the drafts', async () => {
      await settle();
      const [[, where, set]] = callFor(manager.update, FeedingPlanEntity);
      expect(where).toEqual({
        horseId: HORSE_ID,
        status: FeedingPlanStatus.ACTIVE,
      });
      expect(set).toEqual({
        status: FeedingPlanStatus.ARCHIVED,
        archivedAt: expect.any(Date) as unknown,
      });
      expect(callFor(manager.delete, FeedingPlanEntity)[0][1]).toEqual({
        horseId: HORSE_ID,
        status: FeedingPlanStatus.DRAFT,
      });
    });

    it('ends the running care tasks today and deletes those not started yet', async () => {
      await settle();
      const [[, running, set]] = callFor(manager.update, HorseCareTaskEntity);
      expect(running.horseId).toBe(HORSE_ID);
      expect(operator(running.fromDate)).toEqual({
        type: 'lessThanOrEqual',
        value: TODAY,
      });
      expect(operator(running.toDate)).toEqual({
        type: 'moreThan',
        value: TODAY,
      });
      expect(set).toEqual({ toDate: TODAY });
      const [[, future]] = callFor(manager.delete, HorseCareTaskEntity);
      expect(future.horseId).toBe(HORSE_ID);
      expect(operator(future.fromDate)).toEqual({
        type: 'moreThan',
        value: TODAY,
      });
      expect(future).not.toHaveProperty('toDate');
    });

    it('cancels only today’s open checklist', async () => {
      await settle();
      const [[, where, set]] = callFor(manager.update, DailyChecklistEntity);
      expect(where.horseId).toBe(HORSE_ID);
      expect(where.checklistDate).toBe(TODAY);
      expect(operator(where.status)).toEqual({
        type: 'in',
        value: [DailyChecklistStatus.PENDING, DailyChecklistStatus.IN_PROGRESS],
      });
      expect(set).toEqual({ status: DailyChecklistStatus.CANCELLED });
    });

    it('returns what each step changed', async () => {
      manager.update.mockImplementation((entity: unknown) =>
        Promise.resolve({
          affected:
            entity === FeedingPlanEntity
              ? 1
              : entity === HorseCareTaskEntity
                ? 2
                : 1,
        }),
      );
      manager.delete.mockImplementation((entity: unknown) =>
        Promise.resolve({ affected: entity === FeedingPlanEntity ? 3 : 4 }),
      );
      await expect(settle()).resolves.toEqual({
        feedingPlansArchived: 1,
        draftFeedingPlansDeleted: 3,
        careTasksEnded: 2,
        careTasksDeleted: 4,
        checklistCancelled: true,
      });
    });

    it('reports nothing when there was nothing to settle', async () => {
      await expect(settle()).resolves.toEqual({
        feedingPlansArchived: 0,
        draftFeedingPlansDeleted: 0,
        careTasksEnded: 0,
        careTasksDeleted: 0,
        checklistCancelled: false,
      });
    });
  });

  describe('readOnlyImpact', () => {
    it('counts with the same conditions as the settlement and writes nothing', async () => {
      manager.countBy
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1);
      await expect(
        service.readOnlyImpact(
          manager as unknown as EntityManager,
          HORSE_ID,
          TODAY,
        ),
      ).resolves.toEqual({
        feedingPlansToArchive: 1,
        draftFeedingPlansToDelete: 2,
        careTasksToEnd: 3,
        careTasksToDelete: 4,
        checklistToCancel: true,
      });
      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('says the checklist stays when today’s checklist is not open', async () => {
      const impact = await service.readOnlyImpact(
        manager as unknown as EntityManager,
        HORSE_ID,
        TODAY,
      );
      expect(impact.checklistToCancel).toBe(false);
    });
  });
});

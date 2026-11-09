import type { DataSource, EntityManager } from 'typeorm';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { Actor } from '../../../../common/types/actor';
import { UserRole } from '../../../../common/enums/role.enum';
import { AuditAction } from '../../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../../audit/constants/audit-feature.enum';
import {
  CHECKLIST_GENERATION_FAILED_EVENT,
  CHECKLIST_GENERATION_RECOVERED_EVENT,
} from '../../constants/stable-events.constants';
import {
  ChecklistJob,
  checklistRetryName,
} from '../../constants/checklist-job.enum';
import type { ChecklistsService } from './checklists.service';
import { ChecklistGenerationService } from './checklist-generation.service';

jest.mock('../../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({
    id: 'manager-1',
    role: 'CLUB_MANAGER',
    fullName: 'Quản lý',
  }),
}));

describe('ChecklistGenerationService', () => {
  const date = '2026-11-08';
  const actor = (): Actor => ({
    sub: 'kc-manager',
    roles: [UserRole.CLUB_MANAGER],
  });

  let checklists: {
    closePastDays: jest.Mock;
    generateDay: jest.Mock;
  };
  let events: { publish: jest.Mock };
  let audit: { record: jest.Mock };
  let scheduler: {
    doesExist: jest.Mock;
    deleteTimeout: jest.Mock;
    addTimeout: jest.Mock;
  };
  let transaction: jest.Mock;
  let service: ChecklistGenerationService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-08T03:00:00.000Z'));

    checklists = {
      closePastDays: jest.fn().mockResolvedValue(0),
      generateDay: jest.fn().mockResolvedValue({ generated: 0, failures: [] }),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    scheduler = {
      doesExist: jest.fn().mockReturnValue(false),
      deleteTimeout: jest.fn(),
      addTimeout: jest.fn(),
    };
    const transactionManager = { id: 'transaction-manager' };
    transaction = jest.fn(
      (work: (manager: EntityManager) => Promise<unknown>) =>
        work(transactionManager as unknown as EntityManager),
    );
    const dataSource = {
      manager: { id: 'default-manager' },
      transaction,
    } as unknown as DataSource;

    service = new ChecklistGenerationService(
      checklists as unknown as ChecklistsService,
      dataSource,
      events,
      audit,
      scheduler as unknown as SchedulerRegistry,
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('runs the daily close and generation jobs for the current club date', async () => {
    await service.runDaily();

    expect(checklists.closePastDays).toHaveBeenCalledWith(date);
    expect(checklists.generateDay).toHaveBeenCalledWith(date);
  });

  it('runs the daily jobs once when the application starts', async () => {
    const runDaily = jest
      .spyOn(service, 'runDaily')
      .mockResolvedValue(undefined);

    await service.onApplicationBootstrap();

    expect(runDaily).toHaveBeenCalledTimes(1);
  });

  it('skips a retry after the club date has changed', async () => {
    await expect(service.generateToday('2026-11-07', 2)).resolves.toBeNull();

    expect(checklists.generateDay).not.toHaveBeenCalled();
    expect(scheduler.addTimeout).not.toHaveBeenCalled();
  });

  it('schedules another close attempt when closing past checklists fails', async () => {
    checklists.closePastDays.mockRejectedValueOnce(new Error('database down'));

    await service.closePastDays(date, 2);

    expect(scheduler.addTimeout).toHaveBeenCalledWith(
      checklistRetryName(ChecklistJob.CLOSE_PAST_DAYS),
      expect.anything(),
    );
  });

  it('notifies about persistent generation failures and schedules a retry', async () => {
    checklists.generateDay.mockResolvedValue({
      generated: 0,
      failures: [
        { horseId: 'horse-1', horseName: 'Mây', message: 'database down' },
      ],
    });

    await service.generateToday(date, 3);

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'transaction-manager' }),
      CHECKLIST_GENERATION_FAILED_EVENT,
      expect.objectContaining({ date, horseNames: ['Mây'] }),
    );
    expect(scheduler.addTimeout).toHaveBeenCalledWith(
      checklistRetryName(ChecklistJob.GENERATE_TODAY),
      expect.anything(),
    );
  });

  it('publishes recovery once when generation succeeds after a reported failure', async () => {
    checklists.generateDay.mockResolvedValueOnce({
      generated: 0,
      failures: [{ horseId: 'horse-1', horseName: 'Mây', message: 'failed' }],
    });
    await service.generateToday(date, 3);
    events.publish.mockClear();

    checklists.generateDay.mockResolvedValue({ generated: 1, failures: [] });
    await service.generateToday(date, 4);
    await service.generateToday(date, 5);

    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'transaction-manager' }),
      CHECKLIST_GENERATION_RECOVERED_EVENT,
      expect.objectContaining({ date }),
    );
  });

  it('audits a manager-triggered regeneration and returns its result', async () => {
    checklists.generateDay.mockResolvedValue({ generated: 2, failures: [] });

    await expect(service.regenerateToday(actor())).resolves.toEqual(
      expect.objectContaining({ date, generated: 2, failures: [] }),
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'transaction-manager' }),
      expect.objectContaining({
        actorId: 'manager-1',
        action: AuditAction.CREATE,
        entityType: AuditEntityType.DAILY_CHECKLIST,
        before: null,
        after: { date, generated: 2, failedHorseIds: [] },
        feature: AuditFeature.CHECKLIST,
      }),
    );
  });
});

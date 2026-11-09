import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { Actor } from '../../../../common/types/actor';
import { UserRole } from '../../../../common/enums/role.enum';
import { AuditAction } from '../../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../../audit/constants/audit-feature.enum';
import { DailyChecklistStatus } from '../../constants/daily-checklist-status.enum';
import { DailyChecklistEntity } from '../../entities/daily-checklist.entity';
import type { StableAccessService } from '../../shared/stable-access.service';
import type { DailyChecklistsService } from '../../shared/daily-checklists.service';
import { ChecklistsService } from './checklists.service';

jest.mock('../../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({
    id: 'groom-1',
    role: 'GROOM',
    fullName: 'Groom Một',
  }),
}));

describe('ChecklistsService', () => {
  const actor = (): Actor => ({ sub: 'kc-groom', roles: [UserRole.GROOM] });
  const caller = {
    id: 'groom-1',
    keycloakId: 'kc-groom',
    role: UserRole.GROOM,
    status: 'ACTIVE',
  };
  const date = '2026-11-08';

  let item: {
    id: string;
    checklistId: string;
    taskTypeId: string;
    position: number;
    doneAt: Date | null;
    doneBy: string | null;
    note: string | null;
    evidenceMediaId: string | null;
    doer: { id: string; fullName: string } | null;
    taskType: { id: string; name: string };
  };
  let checklist: DailyChecklistEntity;
  let manager: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let repository: { find: jest.Mock };
  let access: { findHorseForDailyCare: jest.Mock };
  let dailyChecklists: { ensureChecklist: jest.Mock; refreshStatus: jest.Mock };
  let audit: { record: jest.Mock };
  let media: {
    assertAttachableChecklistEvidence: jest.Mock;
    signDownloadUrls: jest.Mock;
  };
  let generationBuilder: Record<string, jest.Mock>;
  let closePastDaysBuilder: Record<string, jest.Mock>;
  let service: ChecklistsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-08T03:00:00.000Z'));

    item = {
      id: 'item-1',
      checklistId: 'checklist-1',
      taskTypeId: 'task-1',
      position: 0,
      doneAt: null,
      doneBy: null,
      note: null,
      evidenceMediaId: null,
      doer: null,
      taskType: { id: 'task-1', name: 'Cho ăn' },
    };
    checklist = {
      id: 'checklist-1',
      horseId: 'horse-1',
      groomId: caller.id,
      checklistDate: date,
      status: DailyChecklistStatus.PENDING,
      horse: { id: 'horse-1', name: 'Mây' },
      groom: caller,
      items: [item],
      completedAt: null,
    } as unknown as DailyChecklistEntity;

    manager = {
      findOne: jest.fn().mockResolvedValue(caller),
      findOneBy: jest.fn((_entity: unknown, where: { id: string }) =>
        Promise.resolve(where.id === item.id ? item : null),
      ),
      findOneOrFail: jest.fn().mockResolvedValue(checklist),
      findOneByOrFail: jest.fn().mockResolvedValue(item),
      save: jest.fn((row: object) => Promise.resolve(row)),
      createQueryBuilder: jest.fn(),
    };
    transaction = jest.fn(
      (work: (entityManager: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
    );
    repository = { find: jest.fn().mockResolvedValue([]) };
    access = { findHorseForDailyCare: jest.fn().mockResolvedValue(undefined) };
    dailyChecklists = {
      ensureChecklist: jest.fn().mockResolvedValue('checklist-1'),
      refreshStatus: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    media = {
      assertAttachableChecklistEvidence: jest
        .fn()
        .mockImplementation((_callerId: string, id: string) =>
          Promise.resolve({ id }),
        ),
      signDownloadUrls: jest
        .fn()
        .mockResolvedValue(new Map([['evidence-1', 'https://s3/get']])),
    };

    generationBuilder = {};
    for (const method of [
      'withDeleted',
      'innerJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'orderBy',
    ]) {
      generationBuilder[method] = jest.fn(() => generationBuilder);
    }
    generationBuilder.getRawMany = jest.fn().mockResolvedValue([]);
    manager.createQueryBuilder.mockReturnValue(generationBuilder);

    closePastDaysBuilder = {};
    for (const method of ['update', 'set', 'where', 'andWhere']) {
      closePastDaysBuilder[method] = jest.fn(() => closePastDaysBuilder);
    }
    closePastDaysBuilder.execute = jest.fn().mockResolvedValue({ affected: 2 });

    const dataSource = {
      manager,
      transaction,
      createQueryBuilder: jest.fn(() => closePastDaysBuilder),
    } as unknown as DataSource;
    service = new ChecklistsService(
      repository as unknown as Repository<DailyChecklistEntity>,
      access as unknown as StableAccessService,
      dailyChecklists as unknown as DailyChecklistsService,
      dataSource,
      audit,
      media as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('listForHorse', () => {
    it('defaults to today and loads the checklist within the caller’s horse access', async () => {
      await expect(
        service.listForHorse(actor(), 'horse-1', {}),
      ).resolves.toEqual([]);

      expect(access.findHorseForDailyCare).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ roles: [UserRole.GROOM] }),
        caller.id,
        'horse-1',
      );
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            horseId: 'horse-1',
            checklistDate: expect.any(Object) as unknown,
          }) as unknown,
          withDeleted: true,
          order: { checklistDate: 'DESC' },
        }),
      );
    });

    it('rejects a range longer than 31 days before querying checklists', async () => {
      await expect(
        service.listForHorse(actor(), 'horse-1', {
          from: date,
          to: '2026-12-10',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.find).not.toHaveBeenCalled();
    });
  });

  describe('tick', () => {
    it('attaches evidence to automatically mark an item done and audit the change', async () => {
      await service.tick(actor(), item.id, {
        evidenceMediaId: 'evidence-1',
        note: '  Đã cho ăn  ',
      });

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          doneAt: new Date('2026-11-08T03:00:00.000Z'),
          doneBy: caller.id,
          note: 'Đã cho ăn',
          evidenceMediaId: 'evidence-1',
        }),
      );
      expect(media.assertAttachableChecklistEvidence).toHaveBeenCalledWith(
        caller.id,
        'evidence-1',
      );
      expect(media.signDownloadUrls).toHaveBeenCalledWith(['evidence-1']);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.CHECKLIST_ITEM,
          entityId: item.id,
          feature: AuditFeature.CHECKLIST,
        }),
      );
      expect(dailyChecklists.refreshStatus).toHaveBeenCalledWith(
        manager,
        checklist,
      );
    });

    it('keeps the original completion time and doer when an item is ticked twice', async () => {
      const completedAt = new Date('2026-11-08T01:00:00.000Z');
      item.doneAt = completedAt;
      item.doneBy = 'original-groom';
      item.evidenceMediaId = 'evidence-1';

      await service.tick(actor(), item.id, { evidenceMediaId: 'evidence-1' });

      expect(item.doneAt).toBe(completedAt);
      expect(item.doneBy).toBe('original-groom');
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('returns 404 when the checklist item does not exist', async () => {
      manager.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.tick(actor(), 'missing-item', { note: 'Thử cập nhật' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects an empty update', async () => {
      await expect(service.tick(actor(), item.id, {})).rejects.toThrow(
        new BadRequestException('Cần gửi ảnh bằng chứng hoặc ghi chú'),
      );

      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('generateDay', () => {
    it('continues after an individual horse fails and returns per-horse failures', async () => {
      generationBuilder.getRawMany.mockResolvedValue([
        { horseId: 'horse-1', horseName: 'Mây' },
        { horseId: 'horse-2', horseName: 'Gió' },
        { horseId: 'horse-3', horseName: 'Sao' },
      ]);
      dailyChecklists.ensureChecklist.mockImplementation(
        (_manager: EntityManager, horseId: string) => {
          if (horseId === 'horse-1') return Promise.resolve('checklist-1');
          if (horseId === 'horse-2') return Promise.resolve(null);
          return Promise.reject(new Error('database unavailable'));
        },
      );

      await expect(service.generateDay(date)).resolves.toEqual({
        generated: 1,
        failures: [
          {
            horseId: 'horse-3',
            horseName: 'Sao',
            message: 'database unavailable',
          },
        ],
      });
      expect(dailyChecklists.ensureChecklist).toHaveBeenCalledTimes(3);
    });
  });

  describe('closePastDays', () => {
    it('marks open checklists before today as incomplete and returns the affected count', async () => {
      await expect(service.closePastDays(date)).resolves.toBe(2);

      expect(closePastDaysBuilder.update).toHaveBeenCalledWith(
        DailyChecklistEntity,
      );
      expect(closePastDaysBuilder.set).toHaveBeenCalledWith({
        status: DailyChecklistStatus.INCOMPLETE,
      });
      expect(closePastDaysBuilder.where).toHaveBeenCalledWith(
        'checklist_date < :today',
        { today: date },
      );
      expect(closePastDaysBuilder.andWhere).toHaveBeenCalled();
    });

    it('returns zero when the update affects no rows', async () => {
      closePastDaysBuilder.execute.mockResolvedValue({ affected: undefined });

      await expect(service.closePastDays(date)).resolves.toBe(0);
    });
  });
});

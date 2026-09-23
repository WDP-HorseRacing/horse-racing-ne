import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorsesSharedRepository } from '../../horses/shared/horses-shared.repository';
import { UserEntity } from '../../users/entities/user.entity';
import { BarnStatus } from '../constants/barn-status.enum';
import { DailyChecklistsService } from '../shared/daily-checklists.service';
import { BarnEntity } from '../entities/barn.entity';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { GROOM_ASSIGNMENT_CHANGED_EVENT } from '../constants/stable-events.constants';
import { StableAccessService } from '../shared/stable-access.service';
import { GroomAssignmentsService } from './groom-assignments.service';

type Row = Record<string, unknown> | null;

const anyDate: unknown = expect.any(Date);
const anything: unknown = expect.anything();

describe('GroomAssignmentsService', () => {
  const caller = {
    id: 'ht-1',
    status: UserStatus.ACTIVE,
    role: UserRole.HEAD_TRAINER,
  };
  const newGroom = {
    id: 'g-new',
    fullName: 'Groom Mới',
    email: 'g@x.vn',
    role: UserRole.GROOM,
    status: UserStatus.ACTIVE,
  };
  let rows: Map<unknown, Row>;
  let groomRow: Row;
  let openChecklists: Record<string, unknown>[];
  let clashingChecklists: Record<string, unknown>[];
  let manager: {
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    find: jest.Mock;
    query: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let transaction: jest.Mock;
  let service: GroomAssignmentsService;

  const actor = (): Actor => ({
    sub: 'kc-ht',
    roles: [UserRole.HEAD_TRAINER],
  });

  beforeEach(() => {
    rows = new Map<unknown, Row>([
      [UserEntity, caller],
      [
        HorseEntity,
        {
          id: 'h1',
          barnId: 'b1',
          lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        },
      ],
      [GroomAssignmentEntity, null],
      [BarnEntity, { id: 'b1', status: BarnStatus.ACTIVE }],
    ]);
    groomRow = newGroom;
    openChecklists = [];
    clashingChecklists = [];
    manager = {
      findOne: jest.fn((entity: unknown, options: { where: { id?: string } }) =>
        Promise.resolve(
          entity === UserEntity && options.where.id
            ? groomRow
            : (rows.get(entity) ?? null),
        ),
      ),
      findOneBy: jest.fn((entity: unknown) =>
        Promise.resolve(rows.get(entity) ?? null),
      ),
      find: jest.fn(
        (_entity: unknown, options: { where: { groomId: string } }) =>
          Promise.resolve(
            options.where.groomId === 'g-old'
              ? openChecklists
              : clashingChecklists,
          ),
      ),
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      create: jest.fn((_entity: unknown, row: object) => row),
      save: jest.fn((row: object) => Promise.resolve({ id: 'ga-new', ...row })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn() };
    transaction = jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
      work(manager),
    );
    const dataSource = { manager, transaction } as unknown as DataSource;
    const horseAccess = new HorseAccessService(
      dataSource,
      new HorsesSharedRepository(dataSource),
    );
    service = new GroomAssignmentsService(
      dataSource,
      audit,
      events as unknown as DomainEventPublisher,
      new StableAccessService(horseAccess),
      horseAccess,
      new DailyChecklistsService(),
    );
  });

  describe('assign', () => {
    const assign = () => service.assign(actor(), 'h1', { groomId: 'g-new' });

    it('rejects a groom that does not exist', async () => {
      groomRow = null;
      await expect(assign()).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it.each([
      ['an inactive groom', { status: UserStatus.INACTIVE }],
      ['a locked groom', { status: UserStatus.LOCKED }],
      ['a user who is not a groom', { role: UserRole.VETERINARIAN }],
    ])('rejects %s', async (_label, patch) => {
      groomRow = { ...newGroom, ...patch };
      await expect(assign()).rejects.toThrow(
        new BadRequestException(
          'Groom phụ trách không hợp lệ hoặc không ở trạng thái hoạt động',
        ),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('locks the groom user row inside the transaction before checking it', async () => {
      await assign();
      expect(manager.findOne).toHaveBeenCalledWith(UserEntity, {
        where: { id: 'g-new' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(transaction.mock.invocationCallOrder[0]).toBeLessThan(
        manager.findOne.mock.invocationCallOrder[1],
      );
    });

    it.each([BarnStatus.MAINTENANCE, BarnStatus.CLOSED])(
      'rejects a horse whose barn is %s, like stall assignment',
      async (status) => {
        rows.set(BarnEntity, { id: 'b1', status });
        await expect(assign()).rejects.toThrow(
          new BadRequestException('Khu chuồng không ở trạng thái hoạt động'),
        );
        expect(manager.findOne).toHaveBeenCalledWith(BarnEntity, {
          where: { id: 'b1' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(manager.save).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
      },
    );

    it('rejects a horse that does not exist', async () => {
      rows.set(HorseEntity, null);
      await expect(assign()).rejects.toThrow(NotFoundException);
    });

    it('rejects a horse without a barn and points to the Club Manager', async () => {
      rows.set(HorseEntity, { id: 'h1', barnId: null });
      await expect(assign()).rejects.toThrow(
        new ConflictException(
          'Ngựa chưa được xếp khu chuồng, vui lòng liên hệ Club Manager để xếp khu trước',
        ),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a head trainer who does not lead the horse barn', async () => {
      manager.query.mockResolvedValue([]);
      await expect(assign()).rejects.toThrow(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a transferred horse', async () => {
      rows.set(HorseEntity, {
        id: 'h1',
        barnId: 'b1',
        lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
      });
      await expect(assign()).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('locks the horse before checking it', async () => {
      await assign();
      expect(manager.findOne).toHaveBeenCalledWith(HorseEntity, {
        where: { id: 'h1' },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('gives a first groom to a horse and records an audit', async () => {
      const result = await assign();
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ horseId: 'h1', groomId: 'g-new' }),
      );
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: AuditEntityType.GROOM_ASSIGNMENT,
          entityId: 'ga-new',
          before: { horseId: 'h1', groomId: null, endedAssignmentId: null },
          after: { horseId: 'h1', groomId: 'g-new', movedChecklistIds: [] },
          feature: 'F1.7',
        }),
      );
      expect(result).toMatchObject({ groomId: 'g-new' });
    });

    it('publishes the groom change after the transaction commits', async () => {
      await assign();
      expect(events.publish).toHaveBeenCalledWith(
        GROOM_ASSIGNMENT_CHANGED_EVENT,
        {
          eventId: 'ga-new',
          horseId: 'h1',
          newGroomId: 'g-new',
          previousGroomId: null,
        },
      );
      expect(events.publish.mock.invocationCallOrder[0]).toBeGreaterThan(
        transaction.mock.invocationCallOrder[0],
      );
    });

    it('changes nothing when the same groom is assigned again', async () => {
      rows.set(GroomAssignmentEntity, {
        id: 'ga-old',
        horseId: 'h1',
        groomId: 'g-new',
        endAt: null,
      });
      await expect(assign()).resolves.toMatchObject({ id: 'ga-old' });
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    describe('when the horse already has another groom', () => {
      beforeEach(() => {
        rows.set(GroomAssignmentEntity, {
          id: 'ga-old',
          horseId: 'h1',
          groomId: 'g-old',
          endAt: null,
        });
      });

      it('closes the old assignment and moves unfinished checklists from today on', async () => {
        openChecklists = [
          { id: 'c1', checklistDate: '2026-09-23' },
          { id: 'c2', checklistDate: '2026-09-24' },
        ];
        const openChecklistFilter: unknown = expect.objectContaining({
          horseId: 'h1',
          groomId: 'g-old',
        });
        const auditAfter: unknown = expect.objectContaining({
          groomId: 'g-new',
          movedChecklistIds: ['c1', 'c2'],
        });
        await assign();
        expect(manager.update).toHaveBeenCalledWith(
          GroomAssignmentEntity,
          { id: 'ga-old' },
          { endAt: anyDate },
        );
        expect(manager.find).toHaveBeenCalledWith(
          DailyChecklistEntity,
          expect.objectContaining({
            where: openChecklistFilter,
            lock: { mode: 'pessimistic_write' },
          }),
        );
        expect(manager.update).toHaveBeenCalledWith(
          DailyChecklistEntity,
          { id: In(['c1', 'c2']) },
          { groomId: 'g-new' },
        );
        expect(audit.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            action: AuditAction.CREATE,
            entityType: AuditEntityType.GROOM_ASSIGNMENT,
            entityId: 'ga-new',
            before: {
              horseId: 'h1',
              groomId: 'g-old',
              endedAssignmentId: 'ga-old',
            },
            after: auditAfter,
            feature: 'F1.7',
          }),
        );
      });

      it('publishes the change with both the new and the old groom', async () => {
        await assign();
        expect(events.publish).toHaveBeenCalledWith(
          GROOM_ASSIGNMENT_CHANGED_EVENT,
          {
            eventId: 'ga-new',
            horseId: 'h1',
            newGroomId: 'g-new',
            previousGroomId: 'g-old',
          },
        );
      });

      it('does not touch checklists when the old groom has none open', async () => {
        await assign();
        expect(manager.update).not.toHaveBeenCalledWith(
          DailyChecklistEntity,
          anything,
          anything,
        );
      });

      it('rejects when the new groom already has a checklist on the same day', async () => {
        openChecklists = [{ id: 'c1', checklistDate: '2026-09-23' }];
        clashingChecklists = [{ id: 'c9', checklistDate: '2026-09-23' }];
        await expect(assign()).rejects.toThrow(/2026-09-23/);
        expect(manager.save).not.toHaveBeenCalled();
      });
    });

    it('maps a concurrent groom assignment unique violation to 409', async () => {
      manager.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], {
          code: '23505',
          constraint: 'groom_assignments_active_horse_uq',
        } as unknown as Error),
      );
      await expect(assign()).rejects.toThrow(
        new ConflictException(
          'Ngựa vừa được giao groom khác, vui lòng tải lại',
        ),
      );
    });
  });

  describe('endGroomByHorse', () => {
    it('returns null when the horse has no open groom assignment', async () => {
      await expect(
        service.endGroomByHorse(manager as unknown as EntityManager, 'h1'),
      ).resolves.toBeNull();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('closes the open assignment and returns the old groom', async () => {
      rows.set(GroomAssignmentEntity, {
        id: 'ga-old',
        horseId: 'h1',
        groomId: 'g-old',
        endAt: null,
      });
      await expect(
        service.endGroomByHorse(manager as unknown as EntityManager, 'h1'),
      ).resolves.toBe('g-old');
      expect(manager.findOne).toHaveBeenCalledWith(GroomAssignmentEntity, {
        where: { horseId: 'h1', endAt: anything },
        lock: { mode: 'pessimistic_write' },
      });
    });
  });

  describe('listWorkload', () => {
    it('maps the counted rows', async () => {
      manager.query.mockResolvedValue([
        { groomId: 'g1', fullName: 'A', activeHorseCount: 3 },
        { groomId: 'g2', fullName: 'B', activeHorseCount: 0 },
      ]);
      await expect(service.listWorkload(actor())).resolves.toEqual([
        { groomId: 'g1', fullName: 'A', activeHorseCount: 3 },
        { groomId: 'g2', fullName: 'B', activeHorseCount: 0 },
      ]);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('h.deleted_at IS NULL'),
        [UserRole.GROOM, UserStatus.ACTIVE],
      );
    });
  });

  describe('listByHorse', () => {
    it('rejects a horse that does not exist with 404', async () => {
      rows.set(HorseEntity, null);
      await expect(service.listByHorse(actor(), 'h1')).rejects.toThrow(
        new NotFoundException('Không tìm thấy ngựa'),
      );
      expect(manager.find).not.toHaveBeenCalled();
    });

    it('lets the club manager read the groom history of a deleted horse', async () => {
      rows.set(HorseEntity, {
        id: 'h1',
        barnId: null,
        deletedAt: new Date('2026-09-01T00:00:00Z'),
      });
      manager.find.mockResolvedValue([
        { id: 'ga-1', horseId: 'h1', groomId: 'g-old', startAt: new Date() },
      ]);
      await expect(
        service.listByHorse(
          { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] },
          'h1',
        ),
      ).resolves.toMatchObject([{ id: 'ga-1', groomId: 'g-old' }]);
      expect(manager.findOne).toHaveBeenCalledWith(HorseEntity, {
        where: { id: 'h1' },
        withDeleted: true,
      });
    });

    it('hides a horse of another owner from a horse owner with 404', async () => {
      rows.set(HorseEntity, { id: 'h1', ownerId: 'someone-else' });
      await expect(
        service.listByHorse(
          { sub: 'kc-ho', roles: [UserRole.HORSE_OWNER] },
          'h1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

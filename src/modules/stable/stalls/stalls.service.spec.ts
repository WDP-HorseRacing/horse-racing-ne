import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
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
import { StallStatus } from '../constants/stall-status.enum';
import { StallType } from '../constants/stall-type.enum';
import { BarnEntity } from '../entities/barn.entity';
import { StallAssignmentEntity } from '../entities/stall-assignment.entity';
import { StallEntity } from '../entities/stall.entity';
import { StableAccessService } from '../shared/stable-access.service';
import { StableSharedRepository } from '../shared/stable-shared.repository';
import { StallsService } from './stalls.service';

type Row = Record<string, unknown> | null;

const anyDate: unknown = expect.any(Date);
const anything: unknown = expect.anything();

describe('StallsService', () => {
  let rows: Map<unknown, Row>;
  let stallRows: Record<string, Row>;
  let manager: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    exists: jest.Mock;
    existsBy: jest.Mock;
    count: jest.Mock;
    query: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };
  let stallRepository: { findOneBy: jest.Mock; softDelete: jest.Mock };
  let stallAssignmentRepository: { findOne: jest.Mock; exists: jest.Mock };
  let audit: { record: jest.Mock };
  let service: StallsService;

  const actorWith = (role: UserRole): Actor => ({
    sub: `kc-${role}`,
    roles: [role],
  });

  beforeEach(() => {
    rows = new Map<unknown, Row>([
      [
        UserEntity,
        {
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.HEAD_TRAINER,
        },
      ],
      [
        HorseEntity,
        {
          id: 'h1',
          name: 'Gió',
          barnId: 'b1',
          lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        },
      ],
      [StallAssignmentEntity, null],
      [
        BarnEntity,
        {
          id: 'b1',
          status: BarnStatus.ACTIVE,
          capacity: 10,
          headTrainerId: 'user-1',
        },
      ],
    ]);
    stallRows = {
      s1: {
        id: 's1',
        barnId: 'b1',
        code: 'A-01',
        status: StallStatus.AVAILABLE,
      },
      s0: {
        id: 's0',
        barnId: 'b1',
        code: 'A-00',
        status: StallStatus.OCCUPIED,
      },
    };
    manager = {
      findOne: jest.fn((entity: unknown, options: { where: { id?: string } }) =>
        Promise.resolve(
          entity === StallEntity
            ? (stallRows[options.where.id ?? ''] ?? null)
            : (rows.get(entity) ?? null),
        ),
      ),
      findOneOrFail: jest.fn(
        (_entity: unknown, options: { where: { id: string } }) =>
          Promise.resolve(stallRows[options.where.id]),
      ),
      exists: jest.fn().mockResolvedValue(false),
      existsBy: jest.fn().mockResolvedValue(false),
      count: jest.fn().mockResolvedValue(3),
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes('"freeStallCount"')
            ? [{ barnId: 'b1', freeStallCount: 1, pendingStallHorseCount: 0 }]
            : [{ '?column?': 1 }],
        ),
      ),
      create: jest.fn((_entity: unknown, row: object) => row),
      save: jest.fn((row: object) => Promise.resolve({ id: 'sa-new', ...row })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    stallRepository = {
      findOneBy: jest.fn((where: { id: string }) =>
        Promise.resolve(stallRows[where.id] ?? null),
      ),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    stallAssignmentRepository = {
      findOne: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    } as unknown as DataSource;
    service = new StallsService(
      stallRepository as unknown as Repository<StallEntity>,
      stallAssignmentRepository as unknown as Repository<StallAssignmentEntity>,
      dataSource,
      audit,
      new StableAccessService(
        new HorseAccessService(
          dataSource,
          new HorsesSharedRepository(dataSource),
        ),
      ),
      new StableSharedRepository(),
    );
  });

  describe('moveHorseToStall', () => {
    const move = (stallId = 's1') =>
      service.moveHorseToStall(actorWith(UserRole.HEAD_TRAINER), 'h1', {
        stallId,
      });

    it('rejects a horse that does not exist', async () => {
      rows.set(HorseEntity, null);
      await expect(move()).rejects.toThrow(NotFoundException);
    });

    it('rejects a horse without a barn and points to the Club Manager', async () => {
      rows.set(HorseEntity, { id: 'h1', barnId: null });
      await expect(move()).rejects.toThrow(
        new ConflictException(
          'Ngựa chưa được xếp khu chuồng, vui lòng liên hệ Club Manager để xếp khu trước',
        ),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a head trainer who does not lead the horse barn', async () => {
      manager.query.mockResolvedValue([]);
      await expect(move()).rejects.toThrow(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a transferred horse', async () => {
      rows.set(HorseEntity, {
        id: 'h1',
        barnId: 'b1',
        lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
      });
      await expect(move()).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a stall that does not exist', async () => {
      await expect(move('missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects a stall in another barn', async () => {
      stallRows.s1 = { ...stallRows.s1, barnId: 'b2' };
      await expect(move()).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it.each([StallStatus.OCCUPIED, StallStatus.MAINTENANCE])(
      'rejects a %s stall',
      async (status) => {
        stallRows.s1 = { ...stallRows.s1, status };
        await expect(move()).rejects.toThrow(ConflictException);
        expect(manager.save).not.toHaveBeenCalled();
      },
    );

    it('rejects a horse whose barn is not active and locks the barn first', async () => {
      rows.set(BarnEntity, { id: 'b1', status: BarnStatus.MAINTENANCE });
      await expect(move()).rejects.toThrow(
        new BadRequestException('Khu chuồng không ở trạng thái hoạt động'),
      );
      expect(manager.findOne).toHaveBeenCalledWith(BarnEntity, {
        where: { id: 'b1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a stall that still has an open assignment', async () => {
      manager.exists.mockResolvedValue(true);
      await expect(move()).rejects.toThrow(
        new ConflictException('Ô vừa bị chiếm, vui lòng tải lại sơ đồ ô trống'),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('tells the head trainer to ask the club manager when the barn has no free stall left', async () => {
      stallRows.s1 = { ...stallRows.s1, status: StallStatus.OCCUPIED };
      manager.query.mockImplementation((sql: string) =>
        Promise.resolve(sql.includes('FROM stalls') ? [] : [{ '?column?': 1 }]),
      );
      await expect(move()).rejects.toThrow(
        new ConflictException(
          'Khu đã hết ô trống, đề nghị Club Manager đổi khu cho ngựa',
        ),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('asks to reload the stall map when the barn still has another free stall', async () => {
      stallRows.s1 = { ...stallRows.s1, status: StallStatus.OCCUPIED };
      await expect(move()).rejects.toThrow(
        new ConflictException('Ô vừa bị chiếm, vui lòng tải lại sơ đồ ô trống'),
      );
      const freeStallCall = (
        manager.query.mock.calls as [string, unknown[]][]
      ).find(([sql]) => sql.includes('FROM stalls'));
      expect(freeStallCall?.[1]).toEqual([
        ['b1'],
        StallStatus.AVAILABLE,
        HorseLifecycleStatus.TRANSFERRED,
      ]);
      expect(freeStallCall?.[0]).toMatch(/s\.deleted_at IS NULL/);
      expect(freeStallCall?.[0]).toMatch(/sa\.end_at IS NULL/);
    });

    it('locks the horse and the stall before checking them', async () => {
      await move();
      expect(manager.findOne).toHaveBeenCalledWith(HorseEntity, {
        where: { id: 'h1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.findOne).toHaveBeenCalledWith(StallEntity, {
        where: { id: 's1' },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('assigns a horse with no stall yet and records a CREATE audit', async () => {
      const result = await move();
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ stallId: 's1', horseId: 'h1', endAt: null }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        StallEntity,
        { id: 's1' },
        { status: StallStatus.OCCUPIED },
      );
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ action: AuditAction.CREATE }),
      );
      expect(result).toMatchObject({ stallId: 's1', horseId: 'h1' });
    });

    it('allows a retired horse', async () => {
      rows.set(HorseEntity, {
        id: 'h1',
        barnId: 'b1',
        lifecycleStatus: HorseLifecycleStatus.RETIRED,
      });
      await expect(move()).resolves.toMatchObject({ stallId: 's1' });
    });

    it('moves the horse: closes the old assignment and frees the old stall', async () => {
      rows.set(StallAssignmentEntity, {
        id: 'sa-old',
        horseId: 'h1',
        stallId: 's0',
        endAt: null,
      });
      await move();
      expect(manager.update).toHaveBeenCalledWith(
        StallAssignmentEntity,
        { id: 'sa-old' },
        { endAt: anyDate },
      );
      expect(manager.update).toHaveBeenCalledWith(
        StallEntity,
        { id: 's0' },
        { status: StallStatus.AVAILABLE },
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ stallId: 's1', horseId: 'h1' }),
      );
      expect(
        audit.record.mock.calls.map(
          ([, entry]: [unknown, { action: AuditAction }]) => entry.action,
        ),
      ).toEqual([AuditAction.UPDATE, AuditAction.CREATE]);
    });

    it('changes nothing when the horse is already in that stall', async () => {
      rows.set(StallAssignmentEntity, {
        id: 'sa-old',
        horseId: 'h1',
        stallId: 's1',
        endAt: null,
      });
      await expect(move()).resolves.toMatchObject({ id: 'sa-old' });
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('maps a concurrent stall unique violation to 409', async () => {
      manager.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], {
          code: '23505',
          constraint: 'stall_assignments_active_stall_uq',
        } as unknown as Error),
      );
      await expect(move()).rejects.toThrow(
        new ConflictException('Ô vừa bị chiếm, vui lòng tải lại sơ đồ ô trống'),
      );
    });
  });

  describe('endAssignment', () => {
    const end = (roles: UserRole[] = [UserRole.HEAD_TRAINER]) =>
      service.endAssignment({ sub: 'kc-user', roles }, 'sa-1');

    beforeEach(() => {
      rows.set(StallAssignmentEntity, {
        id: 'sa-1',
        horseId: 'h1',
        stallId: 's0',
        startAt: new Date('2026-01-01T00:00:00Z'),
        endAt: null,
      });
      stallAssignmentRepository.findOne.mockImplementation(() =>
        Promise.resolve(rows.get(StallAssignmentEntity)),
      );
    });

    it('rejects an assignment that does not exist', async () => {
      rows.set(StallAssignmentEntity, null);
      await expect(end()).rejects.toThrow(NotFoundException);
    });

    it('rejects a head trainer ending an assignment of a horse outside their barn', async () => {
      manager.query.mockResolvedValue([]);
      await expect(end()).rejects.toThrow(ForbiddenException);
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a head trainer who is also club manager when the horse is outside their barn', async () => {
      manager.query.mockResolvedValue([]);
      await expect(
        end([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER]),
      ).rejects.toThrow(ForbiddenException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('locks the assignment row inside the transaction', async () => {
      await end();
      expect(manager.findOne).toHaveBeenCalledWith(StallAssignmentEntity, {
        where: { id: 'sa-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(stallAssignmentRepository.findOne).not.toHaveBeenCalled();
    });

    it('rejects an assignment already ended with 409', async () => {
      rows.set(StallAssignmentEntity, {
        id: 'sa-1',
        horseId: 'h1',
        stallId: 's0',
        endAt: new Date('2026-02-01T00:00:00Z'),
      });
      const result = end();
      await expect(result).rejects.toBeInstanceOf(ConflictException);
      await expect(result).rejects.toThrow(
        'Lượt phân công chuồng này đã kết thúc trước đó',
      );
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('ends the assignment, locks the stall and frees it', async () => {
      const result = await end();
      expect(manager.update).toHaveBeenCalledWith(
        StallAssignmentEntity,
        { id: 'sa-1' },
        { endAt: anyDate },
      );
      expect(manager.findOneOrFail).toHaveBeenCalledWith(
        StallEntity,
        expect.objectContaining({
          where: { id: 's0' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        StallEntity,
        { id: 's0' },
        { status: StallStatus.AVAILABLE },
      );
      expect(result).toMatchObject({ id: 'sa-1', endAt: anyDate });
    });

    it('keeps the stall status when another open assignment still uses it', async () => {
      manager.exists.mockResolvedValue(true);
      await end();
      expect(manager.exists).toHaveBeenCalledWith(StallAssignmentEntity, {
        where: { stallId: 's0', endAt: anything },
      });
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalledWith(
        StallEntity,
        anything,
        anything,
      );
    });

    it('keeps the stall status when the stall is not OCCUPIED', async () => {
      stallRows.s0 = { ...stallRows.s0, status: StallStatus.MAINTENANCE };
      await end();
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalledWith(
        StallEntity,
        anything,
        anything,
      );
    });

    it('records an UPDATE audit with endAt and the stall code', async () => {
      await end();
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(manager, {
        actorId: 'user-1',
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.STALL_ASSIGNMENT,
        feature: 'F1.7',
        entityId: 'sa-1',
        before: {
          horseId: 'h1',
          stallId: 's0',
          stallCode: 'A-00',
          endAt: null,
        },
        after: {
          horseId: 'h1',
          stallId: 's0',
          stallCode: 'A-00',
          endAt: anyDate,
        },
      });
    });
  });

  describe('releaseStallByHorse', () => {
    it('returns null when the horse has no open stall assignment', async () => {
      await expect(
        service.releaseStallByHorse(manager as unknown as EntityManager, 'h1'),
      ).resolves.toBeNull();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('closes the open assignment, frees the stall and returns it', async () => {
      rows.set(StallAssignmentEntity, {
        id: 'sa-old',
        horseId: 'h1',
        stallId: 's0',
        endAt: null,
      });
      await expect(
        service.releaseStallByHorse(manager as unknown as EntityManager, 'h1'),
      ).resolves.toEqual({ stallId: 's0', stallCode: 'A-00' });
      expect(manager.findOne).toHaveBeenCalledWith(StallAssignmentEntity, {
        where: { horseId: 'h1', endAt: anything },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(
        StallAssignmentEntity,
        { id: 'sa-old' },
        { endAt: anyDate },
      );
      expect(manager.update).toHaveBeenCalledWith(
        StallEntity,
        { id: 's0' },
        { status: StallStatus.AVAILABLE },
      );
    });
  });

  describe('Club Manager stall writes', () => {
    const actor = () => actorWith(UserRole.CLUB_MANAGER);

    beforeEach(() => {
      rows.set(UserEntity, {
        id: 'cm-1',
        status: UserStatus.ACTIVE,
        role: UserRole.CLUB_MANAGER,
      });
    });

    describe('create', () => {
      const create = () =>
        service.create(actor(), { barnId: 'b1', code: ' A-09 ' });

      it('rejects a barn that does not exist', async () => {
        rows.set(BarnEntity, null);
        await expect(create()).rejects.toThrow(NotFoundException);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('rejects a barn that is not active', async () => {
        rows.set(BarnEntity, {
          id: 'b1',
          status: BarnStatus.CLOSED,
          capacity: 10,
        });
        await expect(create()).rejects.toThrow(BadRequestException);
      });

      it('locks the barn before counting its stalls', async () => {
        await create();
        expect(manager.findOne).toHaveBeenCalledWith(BarnEntity, {
          where: { id: 'b1' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(manager.findOne.mock.invocationCallOrder[1]).toBeLessThan(
          manager.count.mock.invocationCallOrder[0],
        );
        expect(manager.count).toHaveBeenCalledWith(StallEntity, {
          where: { barnId: 'b1' },
        });
      });

      it('rejects a barn that reached its capacity', async () => {
        manager.count.mockResolvedValue(10);
        await expect(create()).rejects.toThrow(
          new ConflictException(
            'Khu chuồng đã đạt sức chứa tối đa (10 ô chuồng)',
          ),
        );
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('rejects a code that already exists', async () => {
        manager.existsBy.mockResolvedValue(true);
        await expect(create()).rejects.toThrow(
          new ConflictException('Mã ô chuồng đã tồn tại'),
        );
        expect(manager.existsBy).toHaveBeenCalledWith(StallEntity, {
          code: 'A-09',
        });
      });

      it('maps a concurrent unique violation on the code to 409', async () => {
        manager.save.mockRejectedValue(
          new QueryFailedError('INSERT', [], {
            code: '23505',
          } as unknown as Error),
        );
        await expect(create()).rejects.toThrow(
          new ConflictException('Mã ô chuồng đã tồn tại'),
        );
      });

      it('records a CREATE audit with the created fields', async () => {
        await create();
        expect(audit.record).toHaveBeenCalledTimes(1);
        expect(audit.record).toHaveBeenCalledWith(manager, {
          actorId: 'cm-1',
          action: AuditAction.CREATE,
          entityType: AuditEntityType.STALL,
          entityId: 'sa-new',
          before: null,
          after: {
            barnId: 'b1',
            code: 'A-09',
            type: StallType.STANDARD,
            status: StallStatus.AVAILABLE,
            description: null,
            hasCamera: false,
          },
          feature: 'F1.7',
        });
      });

      it('always creates the stall as AVAILABLE', async () => {
        await expect(create()).resolves.toMatchObject({
          barnId: 'b1',
          code: 'A-09',
          status: StallStatus.AVAILABLE,
        });
      });
    });

    describe('update', () => {
      it('rejects a stall that does not exist', async () => {
        await expect(
          service.update(actor(), 'missing', { code: 'X' }),
        ).rejects.toThrow(NotFoundException);
      });

      it('locks the stall row inside the transaction', async () => {
        await service.update(actor(), 's1', { code: 'A-11' });
        expect(manager.findOne).toHaveBeenCalledWith(StallEntity, {
          where: { id: 's1' },
          lock: { mode: 'pessimistic_write' },
        });
      });

      it('rejects moving a stall that has a horse to another barn', async () => {
        manager.exists.mockResolvedValue(true);
        await expect(
          service.update(actor(), 's1', { barnId: 'b2' }),
        ).rejects.toThrow(
          new ConflictException(
            'Ô chuồng đang có ngựa, không đổi khu chuồng được',
          ),
        );
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('locks the target barn and rejects it when it reached its capacity', async () => {
        manager.count.mockResolvedValue(10);
        await expect(
          service.update(actor(), 's1', { barnId: 'b2' }),
        ).rejects.toThrow(
          new ConflictException(
            'Khu chuồng đích đã đạt sức chứa tối đa (10 ô chuồng)',
          ),
        );
        expect(manager.findOne).toHaveBeenCalledWith(BarnEntity, {
          where: { id: 'b2' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('rejects a missing target barn', async () => {
        const findOne = manager.findOne.getMockImplementation() as (
          entity: unknown,
          options: { where: { id?: string } },
        ) => Promise<unknown>;
        manager.findOne.mockImplementation(
          (entity: unknown, options: { where: { id?: string } }) =>
            entity === BarnEntity && options.where.id === 'b2'
              ? Promise.resolve(null)
              : findOne(entity, options),
        );
        await expect(
          service.update(actor(), 's1', { barnId: 'b2' }),
        ).rejects.toThrow(
          new NotFoundException('Không tìm thấy khu chuồng đích'),
        );
      });

      it('moves an empty stall to another barn with room', async () => {
        await expect(
          service.update(actor(), 's1', { barnId: 'b2' }),
        ).resolves.toMatchObject({ barnId: 'b2' });
      });

      it('rejects a status change on a stall that has a horse', async () => {
        manager.exists.mockResolvedValue(true);
        await expect(
          service.update(actor(), 's1', { status: StallStatus.MAINTENANCE }),
        ).rejects.toThrow(
          new ConflictException(
            'Ô chuồng đang có ngựa, không đổi trạng thái được',
          ),
        );
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('rejects a manual status change on an OCCUPIED stall', async () => {
        await expect(
          service.update(actor(), 's0', { status: StallStatus.AVAILABLE }),
        ).rejects.toThrow(ConflictException);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('switches an empty stall between AVAILABLE and MAINTENANCE', async () => {
        await expect(
          service.update(actor(), 's1', { status: StallStatus.MAINTENANCE }),
        ).resolves.toMatchObject({ status: StallStatus.MAINTENANCE });
        stallRows.s1 = { ...stallRows.s1, status: StallStatus.MAINTENANCE };
        await expect(
          service.update(actor(), 's1', { status: StallStatus.AVAILABLE }),
        ).resolves.toMatchObject({ status: StallStatus.AVAILABLE });
      });

      it('accepts the current status of a stall that has a horse as no change', async () => {
        manager.exists.mockResolvedValue(true);
        await expect(
          service.update(actor(), 's1', {
            status: StallStatus.AVAILABLE,
            code: 'A-01b',
          }),
        ).resolves.toMatchObject({ code: 'A-01b' });
      });

      it('locks the stall barn before the stall', async () => {
        await service.update(actor(), 's1', { code: 'A-11' });
        const lockOrder = (
          manager.findOne.mock.calls as [unknown, { lock?: unknown }][]
        )
          .map(([entity, options], index) => ({
            entity,
            locked: options.lock !== undefined,
            order: manager.findOne.mock.invocationCallOrder[index],
          }))
          .filter(({ locked }) => locked);
        expect(lockOrder.map(({ entity }) => entity)).toEqual([
          BarnEntity,
          StallEntity,
        ]);
      });

      it('locks the source and target barns in UUID order before the stall', async () => {
        await service.update(actor(), 's1', { barnId: 'a0' });
        const locked = (
          manager.findOne.mock.calls as [
            unknown,
            { where: { id?: string }; lock?: unknown },
          ][]
        )
          .filter(([, options]) => options.lock !== undefined)
          .map(([entity, options]) => [entity, options.where.id]);
        expect(locked).toEqual([
          [BarnEntity, 'a0'],
          [BarnEntity, 'b1'],
          [StallEntity, 's1'],
        ]);
      });

      it('rejects a stall moved to another barn before its lock was taken', async () => {
        manager.findOne.mockImplementation(
          (entity: unknown, options: { lock?: unknown }) =>
            Promise.resolve(
              entity === StallEntity
                ? {
                    ...stallRows.s1,
                    barnId: options.lock ? 'b2' : 'b1',
                  }
                : rows.get(entity),
            ),
        );
        await expect(
          service.update(actor(), 's1', { code: 'A-11' }),
        ).rejects.toThrow(
          new ConflictException(
            'Ô chuồng vừa được chuyển sang khu khác, vui lòng tải lại',
          ),
        );
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('rejects moving a free stall to MAINTENANCE when the barn would lack stalls for pending horses', async () => {
        manager.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('"freeStallCount"')
              ? [{ barnId: 'b1', freeStallCount: 2, pendingStallHorseCount: 2 }]
              : [{ '?column?': 1 }],
          ),
        );
        await expect(
          service.update(actor(), 's1', { status: StallStatus.MAINTENANCE }),
        ).rejects.toThrow(
          new ConflictException(
            'Khu còn 2 ngựa chờ xếp ô, không đưa ô này ra khỏi danh sách ô trống được. Vui lòng xếp ô cho ngựa hoặc chuyển ngựa sang khu khác trước',
          ),
        );
        expect(manager.save).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });

      it('rejects moving a free stall to another barn when its barn would lack stalls for pending horses', async () => {
        manager.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('"freeStallCount"')
              ? [{ barnId: 'b1', freeStallCount: 1, pendingStallHorseCount: 1 }]
              : [{ '?column?': 1 }],
          ),
        );
        await expect(
          service.update(actor(), 's1', { barnId: 'b2' }),
        ).rejects.toThrow(
          new ConflictException(
            'Khu còn 1 ngựa chờ xếp ô, không đưa ô này ra khỏi danh sách ô trống được. Vui lòng xếp ô cho ngựa hoặc chuyển ngựa sang khu khác trước',
          ),
        );
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('moves a free stall to MAINTENANCE when the remaining free stalls still hold every pending horse', async () => {
        manager.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('"freeStallCount"')
              ? [{ barnId: 'b1', freeStallCount: 3, pendingStallHorseCount: 2 }]
              : [{ '?column?': 1 }],
          ),
        );
        await expect(
          service.update(actor(), 's1', { status: StallStatus.MAINTENANCE }),
        ).resolves.toMatchObject({ status: StallStatus.MAINTENANCE });
        const capacityCall = (
          manager.query.mock.calls as [string, unknown[]][]
        ).find(([sql]) => sql.includes('"freeStallCount"'));
        expect(capacityCall?.[1]).toEqual([
          ['b1'],
          StallStatus.AVAILABLE,
          HorseLifecycleStatus.TRANSFERRED,
        ]);
      });

      it('does not check pending horses when a MAINTENANCE stall goes back to AVAILABLE', async () => {
        stallRows.s1 = { ...stallRows.s1, status: StallStatus.MAINTENANCE };
        manager.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('"freeStallCount"')
              ? [{ barnId: 'b1', freeStallCount: 0, pendingStallHorseCount: 5 }]
              : [{ '?column?': 1 }],
          ),
        );
        await expect(
          service.update(actor(), 's1', { status: StallStatus.AVAILABLE }),
        ).resolves.toMatchObject({ status: StallStatus.AVAILABLE });
      });

      it('records an UPDATE audit with only the changed fields', async () => {
        await service.update(actor(), 's1', {
          code: ' A-11 ',
          status: StallStatus.AVAILABLE,
        });
        expect(audit.record).toHaveBeenCalledTimes(1);
        expect(audit.record).toHaveBeenCalledWith(manager, {
          actorId: 'cm-1',
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.STALL,
          entityId: 's1',
          before: { code: 'A-01' },
          after: { code: 'A-11' },
          feature: 'F1.7',
        });
      });

      it('saves nothing and records no audit when no field changes', async () => {
        await expect(
          service.update(actor(), 's1', {
            code: 'A-01',
            status: StallStatus.AVAILABLE,
          }),
        ).resolves.toMatchObject({ id: 's1', code: 'A-01' });
        expect(manager.save).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });

      it('maps a unique violation on the code to 409', async () => {
        manager.save.mockRejectedValue(
          new QueryFailedError('UPDATE', [], {
            code: '23505',
          } as unknown as Error),
        );
        await expect(
          service.update(actor(), 's1', { code: 'A-00' }),
        ).rejects.toThrow(new ConflictException('Mã ô chuồng đã tồn tại'));
      });
    });

    describe('remove', () => {
      it('rejects a stall that does not exist', async () => {
        await expect(service.remove(actor(), 'missing')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('rejects a stall that has a horse', async () => {
        manager.exists.mockResolvedValue(true);
        await expect(service.remove(actor(), 's1')).rejects.toThrow(
          new ConflictException(
            'Không thể xóa ô chuồng đang có ngựa phân công',
          ),
        );
        expect(manager.softDelete).not.toHaveBeenCalled();
      });

      it('rejects deleting a free stall when the barn would lack stalls for pending horses', async () => {
        manager.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('"freeStallCount"')
              ? [{ barnId: 'b1', freeStallCount: 1, pendingStallHorseCount: 1 }]
              : [{ '?column?': 1 }],
          ),
        );
        await expect(service.remove(actor(), 's1')).rejects.toThrow(
          new ConflictException(
            'Khu còn 1 ngựa chờ xếp ô, không đưa ô này ra khỏi danh sách ô trống được. Vui lòng xếp ô cho ngựa hoặc chuyển ngựa sang khu khác trước',
          ),
        );
        expect(manager.softDelete).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });

      it('deletes a MAINTENANCE stall without checking pending horses', async () => {
        stallRows.s1 = { ...stallRows.s1, status: StallStatus.MAINTENANCE };
        manager.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('"freeStallCount"')
              ? [{ barnId: 'b1', freeStallCount: 0, pendingStallHorseCount: 5 }]
              : [{ '?column?': 1 }],
          ),
        );
        await service.remove(actor(), 's1');
        expect(manager.softDelete).toHaveBeenCalledWith(StallEntity, {
          id: 's1',
        });
      });

      it('locks the stall barn before the stall', async () => {
        await service.remove(actor(), 's1');
        const locked = (
          manager.findOne.mock.calls as [unknown, { lock?: unknown }][]
        )
          .filter(([, options]) => options.lock !== undefined)
          .map(([entity]) => entity);
        expect(locked).toEqual([BarnEntity, StallEntity]);
      });

      it('records a DELETE audit with the stall before deletion', async () => {
        await service.remove(actor(), 's1');
        expect(audit.record).toHaveBeenCalledTimes(1);
        expect(audit.record).toHaveBeenCalledWith(manager, {
          actorId: 'cm-1',
          action: AuditAction.DELETE,
          entityType: AuditEntityType.STALL,
          entityId: 's1',
          before: {
            barnId: 'b1',
            code: 'A-01',
            type: undefined,
            status: StallStatus.AVAILABLE,
            description: undefined,
            hasCamera: undefined,
          },
          after: null,
          feature: 'F1.7',
        });
      });

      it('locks the stall inside the transaction before checking it has no horse', async () => {
        await service.remove(actor(), 's1');
        expect(manager.findOne).toHaveBeenCalledWith(StallEntity, {
          where: { id: 's1' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(manager.exists).toHaveBeenCalledWith(StallAssignmentEntity, {
          where: { stallId: 's1', endAt: expect.anything() as unknown },
        });
        expect(manager.softDelete).toHaveBeenCalledWith(StallEntity, {
          id: 's1',
        });
        expect(stallRepository.softDelete).not.toHaveBeenCalled();
      });
    });
  });
});

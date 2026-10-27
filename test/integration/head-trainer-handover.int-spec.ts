import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { BarnsService } from '../../src/modules/stable/barns/barns.service';
import { BarnEntity } from '../../src/modules/stable/entities/barn.entity';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { HeadTrainerHandoverService } from '../../src/modules/users/services/head-trainer-handover.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('HeadTrainerHandoverService (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: HeadTrainerHandoverService;
  let manager: Actor;
  let fromId: string;
  let toId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new HeadTrainerHandoverService(
      dataSource,
      new BarnsService(
        dataSource.getRepository(BarnEntity),
        dataSource,
        new StableAccessService(new HorseAccessService(dataSource)),
        new AuditService(),
        new TrainingAccessService(
          dataSource,
          new HorseAccessService(dataSource),
        ),
      ),
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const managerId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [managerId],
    );
    manager = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
    fromId = await seed.user(UserRole.HEAD_TRAINER);
    toId = await seed.user(UserRole.HEAD_TRAINER);
  });

  const barnOf = async (headTrainerId: string): Promise<string> => {
    const barnId = await seed.barn(`Khu ${headTrainerId.slice(0, 6)}`);
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [headTrainerId, barnId],
    );
    return barnId;
  };

  it('moves barns, plans and open classes, keeps finished classes and logs each barn', async () => {
    const barn = await barnOf(fromId);
    const open = await seed.trainingClass(fromId, { status: 'ACTIVE' });
    const done = await seed.trainingClass(fromId, { status: 'COMPLETED' });

    const result = await service.handover(manager, fromId, {
      toHeadTrainerId: toId,
    });

    expect(result).toEqual({ barnsMoved: 1, plansMoved: 2, classesMoved: 1 });
    const [barnRow] = await dataSource.query<
      Array<{ head_trainer_id: string }>
    >('SELECT head_trainer_id FROM barns WHERE id = $1', [barn]);
    expect(barnRow.head_trainer_id).toBe(toId);
    const classes = await dataSource.query<
      Array<{ id: string; head_trainer_id: string }>
    >('SELECT id, head_trainer_id FROM training_classes');
    expect(
      Object.fromEntries(classes.map((row) => [row.id, row.head_trainer_id])),
    ).toEqual({ [open.classId]: toId, [done.classId]: fromId });
    const plans = await dataSource.query<Array<{ head_trainer_id: string }>>(
      'SELECT DISTINCT head_trainer_id FROM training_plans',
    );
    expect(plans).toEqual([{ head_trainer_id: toId }]);
    const audits = await dataSource.query<
      Array<{ entity_id: string; after_data: { headTrainerId: string } }>
    >(
      "SELECT entity_id, after_data FROM audit_logs WHERE entity_type = 'BARN'",
    );
    expect(audits).toEqual([
      { entity_id: barn, after_data: { headTrainerId: toId } },
    ]);
  });

  it('rejects handing over to the same head trainer', async () => {
    await expect(
      service.handover(manager, fromId, { toHeadTrainerId: fromId }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 404 when the source is not a head trainer', async () => {
    const groom = await seed.user(UserRole.GROOM);

    await expect(
      service.handover(manager, groom, { toHeadTrainerId: toId }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a receiver with the wrong role (400) or an inactive receiver (409) and moves nothing', async () => {
    const barn = await barnOf(fromId);
    const groom = await seed.user(UserRole.GROOM);
    const locked = await seed.user(UserRole.HEAD_TRAINER, UserStatus.LOCKED);

    await expect(
      service.handover(manager, fromId, { toHeadTrainerId: groom }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.handover(manager, fromId, { toHeadTrainerId: locked }),
    ).rejects.toThrow(ConflictException);
    const [barnRow] = await dataSource.query<
      Array<{ head_trainer_id: string }>
    >('SELECT head_trainer_id FROM barns WHERE id = $1', [barn]);
    expect(barnRow.head_trainer_id).toBe(fromId);
  });

  describe('sessions of the moved classes and of the receiver', () => {
    const session = (
      classId: string,
      start: string,
      end: string,
      status = 'SCHEDULED',
    ) =>
      dataSource.query(
        `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
         VALUES ($1, 1, $2, 'Buổi', $3, $4, $5, 'LIGHT', 3000)`,
        [randomUUID(), classId, start, end, status],
      );
    const headTrainersOfClasses = async () =>
      Object.fromEntries(
        (
          await dataSource.query<
            Array<{ code: string; head_trainer_id: string }>
          >('SELECT code, head_trainer_id FROM training_classes')
        ).map((row) => [row.code, row.head_trainer_id]),
      );
    const dates = { startDate: '2026-01-01', endDate: '2099-12-31' };

    it('refuses with 409 and moves nothing when a moved session overlaps a session of the receiver', async () => {
      const barn = await barnOf(fromId);
      const moved = await seed.trainingClass(fromId, { ...dates, code: 'A' });
      const own = await seed.trainingClass(toId, { ...dates, code: 'B' });
      await session(
        moved.classId,
        '2099-01-10T01:00:00Z',
        '2099-01-10T02:00:00Z',
      );
      await session(
        own.classId,
        '2099-01-10T01:30:00Z',
        '2099-01-10T02:30:00Z',
      );

      await expect(
        service.handover(manager, fromId, { toHeadTrainerId: toId }),
      ).rejects.toThrow(
        new ConflictException(
          'Huấn luyện viên trưởng nhận có buổi trùng giờ: lớp A lúc 08:00 ngày 10/01/2099 trùng lớp B lúc 08:30 ngày 10/01/2099. Đổi giờ các buổi này trước khi bàn giao',
        ),
      );
      expect(await headTrainersOfClasses()).toEqual({ A: fromId, B: toId });
      const [barnRow] = await dataSource.query<
        Array<{ head_trainer_id: string }>
      >('SELECT head_trainer_id FROM barns WHERE id = $1', [barn]);
      expect(barnRow.head_trainer_id).toBe(fromId);
      const plans = await dataSource.query<Array<{ head_trainer_id: string }>>(
        'SELECT head_trainer_id FROM training_plans WHERE id = $1',
        [moved.planId],
      );
      expect(plans).toEqual([{ head_trainer_id: fromId }]);
    });

    it('moves the classes when the overlapping sessions are cancelled, already over or only touch at the edge', async () => {
      const moved = await seed.trainingClass(fromId, { ...dates, code: 'A' });
      const own = await seed.trainingClass(toId, { ...dates, code: 'B' });
      await session(
        moved.classId,
        '2099-01-10T01:00:00Z',
        '2099-01-10T02:00:00Z',
      );
      await session(
        own.classId,
        '2099-01-10T02:00:00Z',
        '2099-01-10T03:00:00Z',
      );
      await session(
        own.classId,
        '2099-01-10T01:30:00Z',
        '2099-01-10T02:30:00Z',
        'CANCELLED',
      );
      await session(
        moved.classId,
        '2026-01-10T01:00:00Z',
        '2026-01-10T02:00:00Z',
        'COMPLETED',
      );
      await session(
        own.classId,
        '2026-01-10T01:00:00Z',
        '2026-01-10T02:00:00Z',
        'COMPLETED',
      );

      await expect(
        service.handover(manager, fromId, { toHeadTrainerId: toId }),
      ).resolves.toMatchObject({ classesMoved: 1 });
      expect(await headTrainersOfClasses()).toEqual({ A: toId, B: toId });
    });
  });
});

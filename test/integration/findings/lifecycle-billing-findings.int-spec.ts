import { ConflictException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../../src/common/types/actor';
import {
  clubToday,
  shiftDays,
  toClubDate,
} from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { HorseOwnershipEntity } from '../../../src/modules/horses/entities/horse-ownership.entity';
import { HorseLifecycleStatus } from '../../../src/modules/horses/enums/horse-status.enum';
import { HorseDeletionsModule } from '../../../src/modules/horses/horse-deletions/horse-deletions.module';
import { HorseDeletionsService } from '../../../src/modules/horses/horse-deletions/horse-deletions.service';
import { HorseOwnershipsService } from '../../../src/modules/horses/horse-ownerships/horse-ownerships.service';
import { HorseStatusesModule } from '../../../src/modules/horses/horse-statuses/horse-statuses.module';
import { HorseStatusesService } from '../../../src/modules/horses/horse-statuses/horse-statuses.service';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../../src/modules/horses/shared/horse-ownership.service';
import { MedicalCaseStatus } from '../../../src/modules/medical/constants/medical-case.enum';
import { FinanceReportsRepository } from '../../../src/modules/reports/finance-reports/finance-reports.repository';
import { FinanceReportsService } from '../../../src/modules/reports/finance-reports/finance-reports.service';
import { HorseReportsRepository } from '../../../src/modules/reports/horse-reports/horse-reports.repository';
import { HorseReportsService } from '../../../src/modules/reports/horse-reports/horse-reports.service';
import { ReportsAccessService } from '../../../src/modules/reports/shared/reports-access.service';
import { DailyChecklistStatus } from '../../../src/modules/stable/constants/daily-checklist-status.enum';
import { FeedingPlanStatus } from '../../../src/modules/stable/constants/feeding-plan-status.enum';
import { ChecklistsService } from '../../../src/modules/stable/daily-checklists/checklists.service';
import { DailyChecklistsModule } from '../../../src/modules/stable/daily-checklists/daily-checklists.module';
import { GroomAssignmentsModule } from '../../../src/modules/stable/groom-assignments/groom-assignments.module';
import { GroomAssignmentsService } from '../../../src/modules/stable/groom-assignments/groom-assignments.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

const FEE = 100000;

const blockedMessage = (label: string) =>
  `Ngựa đã phát sinh dữ liệu nghiệp vụ (${label}), hãy đổi trạng thái vòng đời thay vì xóa`;

describe('Findings: horse lifecycle, ownership, billing (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let statuses: HorseStatusesService;
  let deletions: HorseDeletionsService;
  let checklists: ChecklistsService;
  let grooms: GroomAssignmentsService;
  let ownerships: HorseOwnershipsService;
  let finance: FinanceReportsService;
  let horseReports: HorseReportsService;
  let today: string;
  let cmId: string;
  let cm: Actor;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const billedDays = async (
    ownerId: string,
    horseId: string,
    from: string,
    to: string,
  ) => {
    const report = await finance.ownerCost(cm, { from, to, ownerId });
    return (
      report.horses.find((row) => row.horseId === horseId)?.billedDays ?? 0
    );
  };

  const feeFromLongAgo = () =>
    dataSource.query(
      `INSERT INTO daily_fees (effective_from, daily_fee, created_by) VALUES ($1, $2, $3)`,
      ['2026-01-01', FEE, cmId],
    );

  /** Dòng nhật ký tạo hồ sơ như horse-profiles ghi (có lifecycleStatus ACTIVE) */
  const createdAudit = (horse: string) =>
    seed.horseAudit(
      horse,
      {},
      { lifecycleStatus: HorseLifecycleStatus.ACTIVE },
      '2026-01-01T00:00:00Z',
    );

  const ownedHorse = async (name: string) => {
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse(name, { ownerId: owner });
    await seed.ownership(horse, owner, '2026-01-01T00:00:00Z');
    await createdAudit(horse);
    return { owner, horse };
  };

  /** Khu có HT, ngựa có chủ, groom phụ trách, loại việc áp cho mọi ngựa, checklist hôm nay, khẩu phần ACTIVE */
  const stableHorse = async () => {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const groomId = await seed.user(UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Gió', { barnId: barn, ownerId: owner });
    await seed.ownership(horse, owner, '2026-01-01T00:00:00Z');
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now() - interval '1 day')`,
      [horse, groomId],
    );
    await dataSource.query(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active) VALUES (1, 'Cho ăn', true, true)`,
    );
    await checklists.generateDay(today);
    const [plan] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO feeding_plans (version, horse_id, status, created_by, approved_by, approved_at)
       VALUES (1, $1, 'ACTIVE', $2, $2, now()) RETURNING id`,
      [horse, trainerId],
    );
    const [item] = await dataSource.query<{ id: string }[]>(
      `SELECT i.id FROM daily_checklist_items i
         JOIN daily_checklists c ON c.id = i.checklist_id
        WHERE c.horse_id = $1`,
      [horse],
    );
    return {
      horse,
      trainerId,
      groomId,
      planId: plan.id,
      itemId: item.id,
      groom: await actorOf(groomId, UserRole.GROOM),
      trainer: await actorOf(trainerId, UserRole.HEAD_TRAINER),
    };
  };

  const recordDeath = (horse: string) =>
    statuses.updateLifecycle(cm, horse, {
      lifecycleStatus: HorseLifecycleStatus.DECEASED,
      reason: 'Đau bụng',
    });

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        HorseStatusesModule,
        HorseDeletionsModule,
        DailyChecklistsModule,
        GroomAssignmentsModule,
      ],
    }).compile();
    statuses = moduleRef.get(HorseStatusesService);
    deletions = moduleRef.get(HorseDeletionsService);
    checklists = moduleRef.get(ChecklistsService);
    grooms = moduleRef.get(GroomAssignmentsService);
    const access = new HorseAccessService(dataSource);
    ownerships = new HorseOwnershipsService(
      dataSource.getRepository(HorseOwnershipEntity),
      access,
      new HorseOwnershipService(),
      dataSource,
      new AuditService(),
      { publish: jest.fn().mockResolvedValue(undefined) },
    );
    finance = new FinanceReportsService(
      new FinanceReportsRepository(dataSource),
      dataSource,
    );
    horseReports = new HorseReportsService(
      new HorseReportsRepository(dataSource),
      access,
      new ReportsAccessService({} as never),
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    cmId = await seed.user(UserRole.CLUB_MANAGER);
    cm = await actorOf(cmId, UserRole.CLUB_MANAGER);
  });

  describe('B3 consequences of death on daily care', () => {
    it('B3a archives the ACTIVE feeding plan when the horse dies', async () => {
      const { horse, planId } = await stableHorse();
      await recordDeath(horse);

      const [plan] = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM feeding_plans WHERE id = $1',
        [planId],
      );
      expect(plan.status).toBe(FeedingPlanStatus.ARCHIVED);
    });

    it('B3b rejects the old groom ticking today’s checklist of a dead horse', async () => {
      const { horse, itemId, groom } = await stableHorse();
      await recordDeath(horse);

      await expect(
        checklists.tick(groom, itemId, { done: true }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('B3c does not mark the dead horse’s checklist INCOMPLETE on the next day', async () => {
      const { horse } = await stableHorse();
      await recordDeath(horse);
      await dataSource.query(
        'UPDATE daily_checklists SET checklist_date = $1 WHERE horse_id = $2',
        [shiftDays(today, -1), horse],
      );

      await checklists.closePastDays(today);

      const [row] = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM daily_checklists WHERE horse_id = $1',
        [horse],
      );
      expect(row.status).not.toBe(DailyChecklistStatus.INCOMPLETE);
    });
  });

  it('B4 records the date of death as the recording day, so billing never runs past it', async () => {
    await feeFromLongAgo();
    const { owner, horse } = await ownedHorse('Mây');
    await recordDeath(horse);

    const [row] = await dataSource.query<{ date_of_death: string }[]>(
      `SELECT to_char(date_of_death, 'YYYY-MM-DD') AS date_of_death FROM horses WHERE id = $1`,
      [horse],
    );
    expect(row.date_of_death).toBe(today);
    const from = shiftDays(today, -6);
    const to = shiftDays(today, -1);
    expect(await billedDays(owner, horse, from, to)).toBe(6);
  });

  it('B8 counts the fee days of an ACTIVE horse without owner in the club finance report', async () => {
    await feeFromLongAgo();
    await createdAudit(await seed.horse('Không chủ'));
    const from = shiftDays(today, -5);
    const to = shiftDays(today, -1);

    const report = await finance.clubFinance(cm, { from, to });

    expect(report.ownerCharges.dailyFee).toBe(5 * FEE);
  });

  it('B9 refuses to delete a horse that has its own daily task', async () => {
    const horse = await seed.horse('Sao');
    const [type] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active)
       VALUES (1, 'Ngâm chân', false, true) RETURNING id`,
    );
    await dataSource.query(
      `INSERT INTO horse_daily_tasks (horse_id, task_type_id, from_date, to_date, created_by)
       VALUES ($1, $2, $3, $3, $4)`,
      [horse, type.id, today, cmId],
    );

    await expect(
      deletions.remove(cm, horse, { reason: 'Tạo nhầm' }),
    ).rejects.toThrow(
      new ConflictException(blockedMessage('việc chăm sóc riêng')),
    );
    const preview = await deletions.previewRemove(cm, horse);
    expect(preview.allowed).toBe(false);
    expect(preview.businessData).toEqual(['việc chăm sóc riêng']);
  });

  it('B9 refuses to delete a horse that has a surcharge', async () => {
    const horse = await seed.horse('Mây');
    await dataSource.query(
      `INSERT INTO horse_surcharges (version, horse_id, description, daily_amount, start_date, end_date, created_by)
       VALUES (1, $1, 'Bổ sung khớp', 50000, $2, $2, $3)`,
      [horse, today, cmId],
    );

    await expect(
      deletions.remove(cm, horse, { reason: 'Tạo nhầm' }),
    ).rejects.toThrow(
      new ConflictException(blockedMessage('phụ phí chăm sóc')),
    );
    const preview = await deletions.previewRemove(cm, horse);
    expect(preview.allowed).toBe(false);
    expect(preview.businessData).toEqual(['phụ phí chăm sóc']);
  });

  it('F1-5 (gap: no effective date on transfer) does not bill the old owner after the contract date', async () => {
    await feeFromLongAgo();
    const { owner: a, horse } = await ownedHorse('Winx');
    const b = await seed.user(UserRole.HORSE_OWNER);
    const contractDate = shiftDays(today, -9);

    await ownerships.transfer(cm, horse, {
      newOwnerId: b,
      reason: `HĐ ký ${contractDate}`,
      version: 1,
    });

    expect(await billedDays(a, horse, contractDate, shiftDays(today, -1))).toBe(
      0,
    );
  });

  it('F1-6 bills the deleted days again after restore, as the restore preview says', async () => {
    await feeFromLongAgo();
    const { owner, horse } = await ownedHorse('Bão');
    await deletions.remove(cm, horse, { reason: 'Xóa nhầm' });
    await dataSource.query(
      `UPDATE horses SET deleted_at = now() - interval '29 days' WHERE id = $1`,
      [horse],
    );
    await dataSource.query(
      `UPDATE audit_logs SET created_at = now() - interval '29 days' WHERE entity_id = $1`,
      [horse],
    );
    const [row] = await dataSource.query<
      { deleted_at: Date; full_name: string }[]
    >(
      `SELECT h.deleted_at, u.full_name FROM horses h JOIN users u ON u.id = h.owner_id WHERE h.id = $1`,
      [horse],
    );
    const deletedDay = toClubDate(row.deleted_at);
    await dataSource.query(
      `INSERT INTO horse_surcharges (version, horse_id, description, daily_amount, start_date, end_date, created_by)
       VALUES (1, $1, 'Bổ sung khớp', 5000, $2, $3, $4)`,
      [horse, shiftDays(today, -9), shiftDays(today, 40), cmId],
    );

    const preview = await deletions.previewRestore(cm, horse);
    await deletions.restore(cm, horse, { reason: 'Khôi phục' });
    const report = await finance.ownerCost(cm, {
      from: deletedDay,
      to: today,
      ownerId: owner,
    });
    const line = report.horses.find((item) => item.horseId === horse);

    expect(line).toMatchObject({ billedDays: 30, dailyFee: 30 * FEE });
    expect(preview).toMatchObject({
      rebilledDays: line?.billedDays,
      rebilledDailyFee: line?.dailyFee,
      rebilledSurcharge: line?.surcharge,
      rebilledOwnerName: row.full_name,
    });
    expect(preview.rebilledSurcharge).toBe(10 * 5000);
  });

  it('F1-12 rejects recording death again on a dead horse', async () => {
    const { horse } = await ownedHorse('Sương');
    await recordDeath(horse);

    await expect(recordDeath(horse)).rejects.toBeInstanceOf(ConflictException);
  });

  it('F1-18 moves a READY run of a session that already started to the new groom', async () => {
    const { horse, trainerId, groomId, trainer } = await stableHorse();
    const newGroomId = await seed.user(UserRole.GROOM);
    const { classId } = await seed.trainingClass(trainerId);
    const [enrollment] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
       VALUES (1, $1, $2, 'ACTIVE', now()) RETURNING id`,
      [classId, horse],
    );
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi sáng', now() - interval '5 minutes', now() + interval '55 minutes', 'IN_PROGRESS', 'LIGHT', 3000)`,
      [sessionId, classId],
    );
    const [participant] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO session_participants (version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES (1, $1, $2, $3, 'READY', $4) RETURNING id`,
      [sessionId, horse, enrollment.id, groomId],
    );

    await grooms.assign(trainer, horse, { groomId: newGroomId });

    const [row] = await dataSource.query<{ assigned_groom_id: string }[]>(
      'SELECT assigned_groom_id FROM session_participants WHERE id = $1',
      [participant.id],
    );
    expect(row.assigned_groom_id).toBe(newGroomId);
  });

  it('O-1 leaves a CANCELLED medical case out of the health report of later periods', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const { horse } = await ownedHorse('Mưa');
    await seed.medicalCase(horse, vet, {
      status: MedicalCaseStatus.CANCELLED,
      openedAt: '2026-08-01T02:00:00Z',
    });

    const report = await horseReports.health(cm, horse, {
      from: shiftDays(today, -10),
      to: today,
    });

    expect(report.medicalCases).toEqual([]);
  });
});

import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { clubToday } from '../../src/common/utils/club-date';
import { MedicalRecordBarnAtExam1789829500000 } from '../../src/migrations/1789829500000-MedicalRecordBarnAtExam';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import { MedicalCasesService } from '../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitEditsService } from '../../src/modules/medical/medical-records/medical-visit-edits.service';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Medical cost report by barn at exam time (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let visits: MedicalVisitsService;
  let edits: MedicalVisitEditsService;
  let cases: MedicalCasesService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        MedicalRecordsModule,
      ],
    }).compile();
    visits = moduleRef.get(MedicalVisitsService);
    edits = moduleRef.get(MedicalVisitEditsService);
    cases = moduleRef.get(MedicalCasesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  const actorOf = async (role: UserRole): Promise<Actor> => {
    const id = await seed.user(role);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const scene = async () => {
    const vet = await actorOf(UserRole.VETERINARIAN);
    const cm = await actorOf(UserRole.CLUB_MANAGER);
    const barnA = await seed.barn('Khu A');
    const barnB = await seed.barn('Khu B');
    const horse = await seed.horse('Gió', { barnId: barnA });
    return { vet, cm, barnA, barnB, horse };
  };

  const routine = (vet: Actor, horse: string, cost: number) =>
    visits.createStandaloneVisit(vet, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      cost,
    });

  const moveTo = (horse: string, barnId: string) =>
    dataSource.query('UPDATE horses SET barn_id = $1 WHERE id = $2', [
      barnId,
      horse,
    ]);

  const barnOf = async (recordId: string) => {
    const [row] = await dataSource.query<{ barn_id: string | null }[]>(
      'SELECT barn_id FROM medical_records WHERE id = $1',
      [recordId],
    );
    return row.barn_id;
  };

  const totalIn = async (cm: Actor, barnId: string) =>
    (
      await cases.costReport(cm, {
        from: clubToday(),
        to: clubToday(),
        barnId,
      })
    ).totalCost;

  it('keeps the cost in the old barn after the horse moves', async () => {
    const { vet, cm, barnA, barnB, horse } = await scene();
    const visit = await routine(vet, horse, 1_000_000);

    await moveTo(horse, barnB);

    expect(await barnOf(visit.id)).toBe(barnA);
    expect(await totalIn(cm, barnA)).toBe(1_000_000);
    expect(await totalIn(cm, barnB)).toBe(0);
  });

  it('keeps the cost in the barn at exam time after the horse dies and loses its barn', async () => {
    const { vet, cm, barnA, horse } = await scene();
    await routine(vet, horse, 2_000_000);

    await dataSource.query(
      `UPDATE horses SET barn_id = NULL, lifecycle_status = 'DECEASED' WHERE id = $1`,
      [horse],
    );

    expect(await totalIn(cm, barnA)).toBe(2_000_000);
  });

  it('charges standalone and follow-up visits recorded after a move to the new barn', async () => {
    const { vet, cm, barnA, barnB, horse } = await scene();
    const opening = await visits.createStandaloneVisit(vet, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.ISSUE,
      initialDiagnosis: 'Viêm gân',
      cost: 100,
    });

    await moveTo(horse, barnB);
    const followUp = await visits.createFollowUpVisit(
      vet,
      opening.caseId as string,
      { cost: 20 },
    );

    expect(await barnOf(opening.id)).toBe(barnA);
    expect(await barnOf(followUp.id)).toBe(barnB);
    expect(await totalIn(cm, barnA)).toBe(100);
    expect(await totalIn(cm, barnB)).toBe(20);
  });

  it('records no barn for a horse without a barn', async () => {
    const { vet } = await scene();
    const horse = await seed.horse('Mây');

    const visit = await routine(vet, horse, 0);

    expect(await barnOf(visit.id)).toBeNull();
  });

  it('keeps the barn at exam time when the visit is edited after a move', async () => {
    const { vet, barnA, barnB, horse } = await scene();
    const visit = await routine(vet, horse, 0);
    await moveTo(horse, barnB);

    await edits.editVisit(vet, visit.id, {
      reason: 'Gõ nhầm',
      diagnosis: 'Khỏe',
    });

    expect(await barnOf(visit.id)).toBe(barnA);
  });

  describe('MedicalRecordBarnAtExam migration', () => {
    const migration = new MedicalRecordBarnAtExam1789829500000();

    const run = async (step: 'up' | 'down') => {
      const runner = dataSource.createQueryRunner();
      try {
        await migration[step](runner);
      } finally {
        await runner.release();
      }
    };

    it('backfills the barn from the barn change log, else the current barn, else none', async () => {
      const vetId = await seed.user(UserRole.VETERINARIAN);
      const barnA = await seed.barn('Khu A');
      const barnB = await seed.barn('Khu B');
      const moved = await seed.horse('Moved', { barnId: barnB });
      await seed.horseAudit(
        moved,
        { barnId: barnA },
        { barnId: barnB },
        '2026-09-15T02:00:00Z',
      );
      const beforeMove = await seed.visit(moved, vetId, '2026-09-10T02:00:00Z');
      const afterMove = await seed.visit(moved, vetId, '2026-09-20T02:00:00Z');
      const deceased = await seed.horse('Deceased');
      await seed.horseAudit(
        deceased,
        { barnId: barnA, lifecycleStatus: 'ACTIVE' },
        { barnId: null, lifecycleStatus: 'DECEASED' },
        '2026-09-15T02:00:00Z',
      );
      const beforeDeath = await seed.visit(
        deceased,
        vetId,
        '2026-09-10T02:00:00Z',
      );
      const placedLater = await seed.horse('Placed later', { barnId: barnA });
      await seed.horseAudit(
        placedLater,
        { barnId: null },
        { barnId: barnA },
        '2026-09-15T02:00:00Z',
      );
      const beforePlacement = await seed.visit(
        placedLater,
        vetId,
        '2026-09-10T02:00:00Z',
      );
      const noLog = await seed.horse('No log', { barnId: barnB });
      const noLogVisit = await seed.visit(noLog, vetId, '2026-09-10T02:00:00Z');
      const noBarn = await seed.horse('No barn');
      const noBarnVisit = await seed.visit(
        noBarn,
        vetId,
        '2026-09-10T02:00:00Z',
      );
      await run('down');

      await run('up');

      expect(await barnOf(beforeMove)).toBe(barnA);
      expect(await barnOf(afterMove)).toBe(barnB);
      expect(await barnOf(beforeDeath)).toBe(barnA);
      expect(await barnOf(beforePlacement)).toBeNull();
      expect(await barnOf(noLogVisit)).toBe(barnB);
      expect(await barnOf(noBarnVisit)).toBeNull();
    });
  });
});

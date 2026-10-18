import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { clubToday } from '../../src/common/utils/club-date';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../../src/modules/medical/constants/injury-marker.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import { MedicalCasesService } from '../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Injuries across visits (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let visits: MedicalVisitsService;
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
    cases = moduleRef.get(MedicalCasesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  const daysAgo = (days: number) =>
    new Date(Date.now() - days * DAY_MS).toISOString();

  const vet = async (): Promise<Actor> => {
    const id = await seed.user(UserRole.VETERINARIAN);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [UserRole.VETERINARIAN] };
  };

  const sprain = (x: number) => ({
    bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
    injuryType: InjuryType.SPRAIN,
    recoveryStatus: RecoveryStatus.ACUTE,
    position: { x, y: 0.4, z: 0 },
  });

  /** Mở bệnh án bằng buổi khám kết luận Có vấn đề, phát hiện các chấn thương cho trước */
  const discover = async (
    actor: Actor,
    horse: string,
    injuries = [sprain(0.1)],
  ) => {
    const visit = await visits.createStandaloneVisit(actor, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.ISSUE,
      initialDiagnosis: 'Bong gân',
      examDate: daysAgo(3),
      newInjuries: injuries,
    });
    return {
      visit,
      caseId: visit.caseId as string,
      injuryIds: visit.injuries.map((item) => item.injuryId),
    };
  };

  const followUp = (
    actor: Actor,
    caseId: string,
    examDaysAgo: number,
    injuryUpdates: Array<{ injuryId: string; recoveryStatus: RecoveryStatus }>,
  ) =>
    visits.createFollowUpVisit(actor, caseId, {
      examDate: daysAgo(examDaysAgo),
      injuryUpdates,
    });

  it('shows the joined injury facts on each observation of the visit', async () => {
    const author = await vet();
    const horse = await seed.horse('Gió');

    const { visit, injuryIds } = await discover(author, horse, [
      sprain(0.1),
      sprain(0.2),
    ]);

    expect(new Set(injuryIds).size).toBe(2);
    expect(visit.injuries).toEqual([
      expect.objectContaining({
        injuryId: injuryIds[0],
        bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
        injuryType: InjuryType.SPRAIN,
        position: { x: 0.1, y: 0.4, z: 0 },
        recoveryStatus: RecoveryStatus.ACUTE,
      }),
      expect.objectContaining({
        injuryId: injuryIds[1],
        position: { x: 0.2, y: 0.4, z: 0 },
      }),
    ]);
  });

  it('rejects the same injury twice in one visit with 400 and writes nothing', async () => {
    const author = await vet();
    const horse = await seed.horse('Gió');
    const { caseId, injuryIds } = await discover(author, horse);
    const update = {
      injuryId: injuryIds[0],
      recoveryStatus: RecoveryStatus.RECOVERING,
    };

    await expect(
      followUp(author, caseId, 1, [update, update]),
    ).rejects.toMatchObject({ status: 400 });
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM medical_records',
    );
    expect(count).toBe(1);
  });

  it('rejects an injury of another horse with 400', async () => {
    const author = await vet();
    const gio = await seed.horse('Gió');
    const may = await seed.horse('Mây');
    const { caseId } = await discover(author, gio);
    const other = await discover(author, may);

    await expect(
      followUp(author, caseId, 1, [
        {
          injuryId: other.injuryIds[0],
          recoveryStatus: RecoveryStatus.RECOVERING,
        },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an update of a healed injury with 409, and accepts it again once the healing visit is voided', async () => {
    const author = await vet();
    const horse = await seed.horse('Gió');
    const { caseId, injuryIds } = await discover(author, horse);
    const healing = await followUp(author, caseId, 2, [
      { injuryId: injuryIds[0], recoveryStatus: RecoveryStatus.HEALED },
    ]);
    const again = () =>
      followUp(author, caseId, 1, [
        { injuryId: injuryIds[0], recoveryStatus: RecoveryStatus.RECOVERING },
      ]);

    await expect(again()).rejects.toMatchObject({ status: 409 });

    await visits.voidVisit(author, healing.id, { reason: 'Ghi nhầm' });
    await expect(again()).resolves.toBeDefined();
  });

  it('rejects an injury whose every visit is voided with 400', async () => {
    const author = await vet();
    const horse = await seed.horse('Gió');
    const { caseId } = await discover(author, horse);
    const found = await visits.createFollowUpVisit(author, caseId, {
      examDate: daysAgo(2),
      newInjuries: [sprain(0.3)],
    });
    await visits.voidVisit(author, found.id, { reason: 'Nhầm ngựa' });

    await expect(
      followUp(author, caseId, 1, [
        {
          injuryId: found.injuries[0].injuryId,
          recoveryStatus: RecoveryStatus.RECOVERING,
        },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });

  describe('closing the case', () => {
    const close = (actor: Actor, caseId: string, dateOfDeath?: string) =>
      cases.closeCase(actor, caseId, {
        finalConclusion: 'Kết thúc điều trị',
        ...(dateOfDeath ? { dateOfDeath } : {}),
      });

    const caseStatus = async (caseId: string) => {
      const [row] = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM medical_cases WHERE id = $1',
        [caseId],
      );
      return row.status;
    };

    it('answers 409 while an injury is not healed, even one left out of the latest visit', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { caseId, injuryIds } = await discover(author, horse, [
        sprain(0.1),
        sprain(0.2),
      ]);
      await followUp(author, caseId, 1, [
        { injuryId: injuryIds[0], recoveryStatus: RecoveryStatus.HEALED },
      ]);

      await expect(close(author, caseId)).rejects.toMatchObject({
        status: 409,
      });
      expect(await caseStatus(caseId)).toBe(MedicalCaseStatus.OPEN);
    });

    it('closes once every injury is healed', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { caseId, injuryIds } = await discover(author, horse);
      await followUp(author, caseId, 1, [
        { injuryId: injuryIds[0], recoveryStatus: RecoveryStatus.HEALED },
      ]);

      await close(author, caseId);

      expect(await caseStatus(caseId)).toBe(MedicalCaseStatus.CLOSED);
    });

    it('closes with a recorded death although an injury is not healed', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { caseId } = await discover(author, horse);

      await close(author, caseId, clubToday());

      expect(await caseStatus(caseId)).toBe(MedicalCaseStatus.CLOSED);
    });
  });
});

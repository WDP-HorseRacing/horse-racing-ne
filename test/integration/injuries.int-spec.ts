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
import { InjuryCasesModule } from '../../src/modules/medical/injury-cases/injury-cases.module';
import { InjuryCasesService } from '../../src/modules/medical/injury-cases/injury-cases.service';
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
  let reads: InjuryCasesService;

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
        InjuryCasesModule,
      ],
    }).compile();
    visits = moduleRef.get(MedicalVisitsService);
    cases = moduleRef.get(MedicalCasesService);
    reads = moduleRef.get(InjuryCasesService);
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
      expect(
        (await cases.closePreview(author, caseId)).unhealedInjuryCount,
      ).toBe(1);
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

  describe('listing injuries', () => {
    const list = (actor: Actor, horse: string, unhealedOnly?: boolean) =>
      reads.listInjuries(actor, horse, { unhealedOnly });

    it('keeps the status of an injury left out of a later visit', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { caseId, injuryIds } = await discover(author, horse);

      await visits.createFollowUpVisit(author, caseId, {
        examDate: daysAgo(1),
        diagnosis: 'Khám bụng, không xem chân',
      });

      const [injury] = await list(author, horse);
      expect(injury).toMatchObject({
        id: injuryIds[0],
        currentRecoveryStatus: RecoveryStatus.ACUTE,
      });
      expect(injury.history).toHaveLength(1);
    });

    it('orders the history by exam date, a backdated visit included', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { visit, caseId, injuryIds } = await discover(author, horse);
      const later = await followUp(author, caseId, 1, [
        { injuryId: injuryIds[0], recoveryStatus: RecoveryStatus.RECOVERING },
      ]);
      const backdated = await followUp(author, caseId, 2, [
        { injuryId: injuryIds[0], recoveryStatus: RecoveryStatus.ACUTE },
      ]);

      const [injury] = await list(author, horse);

      expect(injury.history.map((item) => item.medicalRecordId)).toEqual([
        visit.id,
        backdated.id,
        later.id,
      ]);
      expect(injury).toMatchObject({
        firstMedicalRecordId: visit.id,
        firstExamDate: visit.examDate,
        currentRecoveryStatus: RecoveryStatus.RECOVERING,
        bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
        position: { x: 0.1, y: 0.4, z: 0 },
      });
      expect(injury.history[0]).toMatchObject({
        caseId,
        examDate: visit.examDate,
        recoveryStatus: RecoveryStatus.ACUTE,
      });
    });

    it('goes back to the previous status when the update visit is voided', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { caseId } = await discover(author, horse);
      const [{ id }] = await list(author, horse);
      const update = await followUp(author, caseId, 1, [
        { injuryId: id, recoveryStatus: RecoveryStatus.HEALED },
      ]);

      await visits.voidVisit(author, update.id, { reason: 'Ghi nhầm' });

      const [injury] = await list(author, horse);
      expect(injury.currentRecoveryStatus).toBe(RecoveryStatus.ACUTE);
      expect(injury.history).toHaveLength(1);
    });

    it('hides an injury once the visit that discovered it is voided', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { caseId, injuryIds } = await discover(author, horse);
      const found = await visits.createFollowUpVisit(author, caseId, {
        examDate: daysAgo(1),
        newInjuries: [sprain(0.3)],
      });

      await visits.voidVisit(author, found.id, { reason: 'Nhầm ngựa' });

      expect((await list(author, horse)).map((item) => item.id)).toEqual(
        injuryIds,
      );
    });

    it('lists only injuries not healed when asked, ordered by first exam date', async () => {
      const author = await vet();
      const horse = await seed.horse('Gió');
      const { caseId, injuryIds } = await discover(author, horse, [
        sprain(0.1),
        sprain(0.2),
      ]);
      const later = await visits.createFollowUpVisit(author, caseId, {
        examDate: daysAgo(2),
        newInjuries: [sprain(0.3)],
      });
      const laterId = later.injuries[0].injuryId;
      await followUp(author, caseId, 1, [
        { injuryId: injuryIds[0], recoveryStatus: RecoveryStatus.HEALED },
      ]);

      const all = (await list(author, horse)).map((item) => item.id);
      expect(all.slice(0, 2).sort()).toEqual([...injuryIds].sort());
      expect(all[2]).toBe(laterId);
      expect((await list(author, horse, true)).map((item) => item.id)).toEqual([
        injuryIds[1],
        laterId,
      ]);
    });
  });
});

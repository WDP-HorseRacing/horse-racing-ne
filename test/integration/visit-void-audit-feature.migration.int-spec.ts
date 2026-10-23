import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { HorseMeasurementType } from '../../src/modules/horses/enums/horse-measurement-type.enum';
import { HorseHealthStatus } from '../../src/modules/horses/enums/horse-status.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import { VisitVoidAuditFeature1789830000000 } from '../../src/migrations/1789830000000-VisitVoidAuditFeature';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('VisitVoidAuditFeature migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let service: MedicalVisitsService;
  const migration = new VisitVoidAuditFeature1789830000000();

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
    service = moduleRef.get(MedicalVisitsService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  const vet = async (): Promise<Actor> => {
    const id = await seed.user(UserRole.VETERINARIAN);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [UserRole.VETERINARIAN] };
  };

  const auditIds = () =>
    dataSource
      .query<{ id: string }[]>('SELECT id FROM audit_logs')
      .then((rows) => rows.map((row) => row.id));

  const writtenBy = async (write: () => Promise<unknown>) => {
    const before = await auditIds();
    await write();
    return (await auditIds()).filter((id) => !before.includes(id));
  };

  const asOldCode = (ids: string[]) =>
    dataSource.query(
      `UPDATE audit_logs SET feature = 'MED_CASE_VISIT'
        WHERE id = ANY($1::uuid[]) AND entity_type <> 'MEDICAL_CASE'`,
      [ids],
    );

  const features = (ids: string[]) =>
    dataSource
      .query<{ entity_type: string; feature: string }[]>(
        `SELECT entity_type, feature FROM audit_logs
          WHERE id = ANY($1::uuid[]) ORDER BY entity_type, feature`,
        [ids],
      )
      .then((rows) => rows.map((row) => `${row.entity_type}:${row.feature}`));

  it('moves the audit rows of voided visits outside a case to MED_VISIT and reverts them on down', async () => {
    const author = await vet();
    const horse = await seed.horse('Winx');
    const request = await seed.examRequest(horse);
    const requestVisit = await service.createStandaloneVisit(author, horse, {
      kind: MedicalVisitKind.REQUEST,
      conclusion: MedicalVisitConclusion.NORMAL,
      requestIds: [request],
      healthStatus: HorseHealthStatus.INJURED,
      healthReason: 'Khám thấy',
      measurements: [{ type: HorseMeasurementType.WEIGHT, value: 450 }],
    });
    const standaloneVoid = await writtenBy(() =>
      service.voidVisit(author, requestVisit.id, { reason: 'Nhầm ngựa' }),
    );

    const other = await seed.horse('Mây');
    const opening = await service.createStandaloneVisit(author, other, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.ISSUE,
      initialDiagnosis: 'Viêm gân',
      measurements: [{ type: HorseMeasurementType.WEIGHT, value: 430 }],
    });
    const followUp = await service.createFollowUpVisit(
      author,
      opening.caseId as string,
      {
        healthStatus: HorseHealthStatus.INJURED,
        healthReason: 'Khám thấy',
        measurements: [{ type: HorseMeasurementType.WEIGHT, value: 440 }],
      },
    );
    const followUpVoid = await writtenBy(() =>
      service.voidVisit(author, followUp.id, { reason: 'Nhầm ngựa' }),
    );
    const openingVoid = await writtenBy(() =>
      service.voidVisit(author, opening.id, { reason: 'Nhầm ngựa' }),
    );
    const unrelated = await writtenBy(() =>
      dataSource.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, reason, feature)
         SELECT actor_id, 'UPDATE', 'HORSE', $1, 'Hủy buổi khám: Nhầm ngựa', 'MED_CASE_VISIT'
           FROM audit_logs WHERE id = $2`,
        [horse, standaloneVoid[0]],
      ),
    );
    await asOldCode([...standaloneVoid, ...openingVoid]);

    const before = {
      standalone: await features(standaloneVoid),
      followUp: await features(followUpVoid),
      opening: await features(openingVoid),
      unrelated: await features(unrelated),
    };
    expect(before.standalone).toEqual([
      'HORSE:MED_CASE_VISIT',
      'HORSE_MEASUREMENT:MED_CASE_VISIT',
      'MEDICAL_EXAM_REQUEST:MED_CASE_VISIT',
      'MEDICAL_RECORD:MED_CASE_VISIT',
    ]);
    expect(before.opening).toEqual([
      'HORSE_MEASUREMENT:MED_CASE_VISIT',
      'MEDICAL_CASE:MED_CASE_VISIT',
      'MEDICAL_RECORD:MED_CASE_VISIT',
    ]);
    expect(before.unrelated).toEqual(['HORSE:MED_CASE_VISIT']);

    const runner = dataSource.createQueryRunner();
    try {
      await migration.up(runner);
      expect(await features(standaloneVoid)).toEqual([
        'HORSE:MED_VISIT',
        'HORSE_MEASUREMENT:MED_VISIT',
        'MEDICAL_EXAM_REQUEST:MED_VISIT',
        'MEDICAL_RECORD:MED_VISIT',
      ]);
      expect(await features(openingVoid)).toEqual([
        'HORSE_MEASUREMENT:MED_VISIT',
        'MEDICAL_CASE:MED_CASE_VISIT',
        'MEDICAL_RECORD:MED_VISIT',
      ]);
      expect(await features(followUpVoid)).toEqual(before.followUp);
      expect(await features(unrelated)).toEqual(before.unrelated);

      await migration.down(runner);
      expect(await features(standaloneVoid)).toEqual(before.standalone);
      expect(await features(openingVoid)).toEqual(before.opening);
      expect(await features(followUpVoid)).toEqual(before.followUp);
      expect(await features(unrelated)).toEqual(before.unrelated);
    } finally {
      await runner.release();
    }
  });
});

import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { InjuriesTable1789828600000 } from '../../src/migrations/1789828600000-InjuriesTable';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

interface InjuryRow {
  id: string;
  horse_id: string;
  body_region: string;
  injury_type: string;
  position: { x: number; y: number; z: number };
  first_medical_record_id: string;
}

describe('InjuriesTable migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  const migration = new InjuriesTable1789828600000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const run = async (step: 'up' | 'down') => {
    const runner = dataSource.createQueryRunner();
    try {
      await migration[step](runner);
    } finally {
      await runner.release();
    }
  };

  const oldMarker = async (
    recordId: string,
    bodyRegion: string,
    injuryType: string,
    x: number,
    recoveryStatus = 'ACUTE',
  ): Promise<string> => {
    const [row] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO injury_markers (medical_record_id, body_region, position, injury_type, recovery_status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        recordId,
        bodyRegion,
        JSON.stringify({ x, y: 0, z: 0 }),
        injuryType,
        recoveryStatus,
      ],
    );
    return row.id;
  };

  const injuryOf = async (markerId: string): Promise<InjuryRow> => {
    const [row] = await dataSource.query<InjuryRow[]>(
      `SELECT i.* FROM injuries i
         JOIN injury_markers m ON m.injury_id = i.id
        WHERE m.id = $1`,
      [markerId],
    );
    return row;
  };

  it('groups old rows per case, per horse for visits without a case, and skips voided visits for the discovery facts', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const gio = await seed.horse('Gió');
    const may = await seed.horse('Mây');
    const firstCase = await seed.medicalCase(gio, vet, {
      status: MedicalCaseStatus.CLOSED,
      closedAt: '2026-09-10T02:00:00Z',
    });
    const secondCase = await seed.medicalCase(gio, vet, {
      openedAt: '2026-09-20T02:00:00Z',
    });
    const v1 = await seed.visit(gio, vet, '2026-09-01T02:00:00Z', {
      caseId: firstCase,
    });
    const v2 = await seed.visit(gio, vet, '2026-09-05T02:00:00Z', {
      caseId: firstCase,
    });
    const v3 = await seed.visit(gio, vet, '2026-09-20T02:00:00Z', {
      caseId: secondCase,
    });
    const voided = await seed.visit(gio, vet, '2026-09-21T02:00:00Z', {
      caseId: secondCase,
      voided: true,
    });
    const v4 = await seed.visit(gio, vet, '2026-09-22T02:00:00Z', {
      caseId: secondCase,
    });
    const s1 = await seed.visit(gio, vet, '2026-10-01T02:00:00Z');
    const s2 = await seed.visit(gio, vet, '2026-10-02T02:00:00Z');
    const other = await seed.visit(may, vet, '2026-10-01T02:00:00Z');
    await run('down');

    const sprainV2 = await oldMarker(v2, 'LEFT_FRONT_LEG', 'SPRAIN', 2);
    const sprainV1 = await oldMarker(v1, 'LEFT_FRONT_LEG', 'SPRAIN', 1);
    const woundV2 = await oldMarker(v2, 'HEAD', 'WOUND', 3);
    const sprainV3 = await oldMarker(v3, 'LEFT_FRONT_LEG', 'SPRAIN', 4);
    const strainVoided = await oldMarker(voided, 'BACK', 'STRAIN', 5);
    const strainV4 = await oldMarker(v4, 'BACK', 'STRAIN', 6);
    const bruiseS1 = await oldMarker(s1, 'NECK', 'CONTUSION', 7);
    const bruiseS2 = await oldMarker(s2, 'NECK', 'CONTUSION', 8, 'HEALED');
    const bruiseOther = await oldMarker(other, 'NECK', 'CONTUSION', 9);

    await run('up');

    const sprain = await injuryOf(sprainV1);
    expect(sprain).toMatchObject({
      horse_id: gio,
      body_region: 'LEFT_FRONT_LEG',
      injury_type: 'SPRAIN',
      position: { x: 1, y: 0, z: 0 },
      first_medical_record_id: v1,
    });
    expect((await injuryOf(sprainV2)).id).toBe(sprain.id);
    expect((await injuryOf(woundV2)).id).not.toBe(sprain.id);
    expect((await injuryOf(sprainV3)).id).not.toBe(sprain.id);

    const strain = await injuryOf(strainVoided);
    expect((await injuryOf(strainV4)).id).toBe(strain.id);
    expect(strain).toMatchObject({
      position: { x: 6, y: 0, z: 0 },
      first_medical_record_id: v4,
    });

    const bruise = await injuryOf(bruiseS1);
    expect((await injuryOf(bruiseS2)).id).toBe(bruise.id);
    expect(bruise.first_medical_record_id).toBe(s1);
    expect((await injuryOf(bruiseOther)).horse_id).toBe(may);

    const [{ count }] = await dataSource.query<Array<{ count: number }>>(
      'SELECT count(*)::int AS count FROM injuries',
    );
    expect(count).toBe(6);
    const columns = await dataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'injury_markers'`,
    );
    expect(columns.map((column) => column.column_name)).not.toEqual(
      expect.arrayContaining(['body_region']),
    );
  });

  it('puts region, position and type back on every row when reverted', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const gio = await seed.horse('Gió');
    const medicalCase = await seed.medicalCase(gio, vet);
    const v1 = await seed.visit(gio, vet, '2026-09-01T02:00:00Z', {
      caseId: medicalCase,
    });
    const v2 = await seed.visit(gio, vet, '2026-09-05T02:00:00Z', {
      caseId: medicalCase,
    });
    await run('down');
    await oldMarker(v1, 'LEFT_FRONT_LEG', 'SPRAIN', 1);
    await oldMarker(v2, 'LEFT_FRONT_LEG', 'SPRAIN', 2, 'RECOVERING');
    await run('up');

    await run('down');

    const rows = await dataSource.query<
      Array<{
        body_region: string;
        injury_type: string;
        position: { x: number };
        recovery_status: string;
      }>
    >(
      `SELECT m.body_region, m.injury_type, m.position, m.recovery_status
         FROM injury_markers m
         JOIN medical_records r ON r.id = m.medical_record_id
        ORDER BY r.exam_date`,
    );
    expect(rows).toEqual([
      {
        body_region: 'LEFT_FRONT_LEG',
        injury_type: 'SPRAIN',
        position: { x: 1, y: 0, z: 0 },
        recovery_status: 'ACUTE',
      },
      {
        body_region: 'LEFT_FRONT_LEG',
        injury_type: 'SPRAIN',
        position: { x: 1, y: 0, z: 0 },
        recovery_status: 'RECOVERING',
      },
    ]);
    await run('up');
  });
});

import { DataSource } from 'typeorm';
import { HorseEntity } from '../../src/modules/horses/entities/horse.entity';
import { HorseProfilesRepository } from '../../src/modules/horses/horse-profiles/horse-profiles.repository';
import { HorsePedigreeRepository } from '../../src/modules/horses/shared/horse-pedigree.repository';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

describe('Pedigree recursive queries (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let pedigree: HorsePedigreeRepository;
  let profiles: HorseProfilesRepository;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    pedigree = new HorsePedigreeRepository();
    profiles = new HorseProfilesRepository(
      dataSource.getRepository(HorseEntity),
      dataSource,
    );
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => truncateAll(dataSource));

  const setParents = (
    horseId: string,
    sireId: string | null,
    damId: string | null,
  ) =>
    dataSource.query(
      'UPDATE horses SET sire_id = $2, dam_id = $3 WHERE id = $1',
      [horseId, sireId, damId],
    );

  const softDelete = (horseId: string) =>
    dataSource.query('UPDATE horses SET deleted_at = now() WHERE id = $1', [
      horseId,
    ]);

  const createsCycle = (childId: string, parentId: string) =>
    pedigree.wouldCreateCycle(dataSource.manager, childId, parentId);

  describe('wouldCreateCycle', () => {
    it('detects a child that is already an ancestor through the sire or dam line', async () => {
      const grandSire = await seed.horse('Ông');
      const grandDam = await seed.horse('Bà');
      const sire = await seed.horse('Cha');
      const foal = await seed.horse('Con');
      const stranger = await seed.horse('Lạ');
      await setParents(sire, grandSire, grandDam);
      await setParents(foal, sire, null);

      await expect(createsCycle(grandSire, foal)).resolves.toBe(true);
      await expect(createsCycle(grandDam, foal)).resolves.toBe(true);
      await expect(createsCycle(sire, foal)).resolves.toBe(true);
      await expect(createsCycle(foal, grandSire)).resolves.toBe(false);
      await expect(createsCycle(stranger, foal)).resolves.toBe(false);
    });

    it('treats a horse as its own ancestor', async () => {
      const horse = await seed.horse('Gió');

      await expect(createsCycle(horse, horse)).resolves.toBe(true);
    });

    it('walks through deleted ancestors and inbred lines', async () => {
      const founder = await seed.horse('Tổ');
      const sire = await seed.horse('Cha');
      const dam = await seed.horse('Mẹ');
      const foal = await seed.horse('Con');
      await setParents(sire, founder, null);
      await setParents(dam, founder, null);
      await setParents(foal, sire, dam);
      await softDelete(sire);

      await expect(createsCycle(founder, foal)).resolves.toBe(true);
    });

    it('stops on pedigree data that already loops', async () => {
      const a = await seed.horse('A');
      const b = await seed.horse('B');
      const outsider = await seed.horse('Ngoài');
      await setParents(a, b, null);
      await setParents(b, a, null);

      await expect(createsCycle(outsider, a)).resolves.toBe(false);
      await expect(createsCycle(b, a)).resolves.toBe(true);
    });
  });

  describe('findPedigreeAncestors', () => {
    const tree = async () => {
      const grandSire = await seed.horse('Ông Nội');
      const grandDam = await seed.horse('Bà Nội');
      const sire = await seed.horse('Cha');
      const dam = await seed.horse('Mẹ');
      const foal = await seed.horse('Con');
      const greatGrandSire = await seed.horse('Cụ');
      await setParents(grandSire, greatGrandSire, null);
      await setParents(sire, grandSire, grandDam);
      await setParents(dam, grandSire, null);
      await setParents(foal, sire, dam);
      return { grandSire, grandDam, sire, dam, foal };
    };

    const rows = async (horseId: string, depth: number) =>
      (await profiles.findPedigreeAncestors(horseId, depth)).map((row) => [
        row.name,
        row.generation,
        row.parentRole,
        row.childId,
      ]);

    it('lists every position up to the depth, sires first, then by name', async () => {
      const t = await tree();

      const both = await rows(t.foal, 2);
      expect(both.slice(0, 2)).toEqual([
        ['Cha', 1, 'SIRE', t.foal],
        ['Mẹ', 1, 'DAM', t.foal],
      ]);
      const [firstChild, secondChild] = [t.sire, t.dam].sort();
      expect(both.slice(2, 4)).toEqual([
        ['Ông Nội', 2, 'SIRE', firstChild],
        ['Ông Nội', 2, 'SIRE', secondChild],
      ]);
      expect(both[4]).toEqual(['Bà Nội', 2, 'DAM', t.sire]);
      expect(both).toHaveLength(5);
      await expect(rows(t.foal, 1)).resolves.toEqual([
        ['Cha', 1, 'SIRE', t.foal],
        ['Mẹ', 1, 'DAM', t.foal],
      ]);
    });

    it('returns the ancestor profile columns', async () => {
      const t = await tree();
      await dataSource.query(
        "UPDATE horses SET gender = 'MALE', breed = 'Thoroughbred', color = 'Nâu', date_of_birth = '2015-04-02', race_aptitude = 'MILER' WHERE id = $1",
        [t.sire],
      );

      const [first] = await profiles.findPedigreeAncestors(t.foal, 1);

      expect(first).toEqual({
        id: t.sire,
        name: 'Cha',
        gender: 'MALE',
        breed: 'Thoroughbred',
        color: 'Nâu',
        dateOfBirth: '2015-04-02',
        raceAptitude: 'MILER',
        ownerId: null,
        generation: 1,
        parentRole: 'SIRE',
        childId: t.foal,
      });
    });

    it('skips deleted ancestors and the line above them, but still reads a deleted horse', async () => {
      const t = await tree();
      await softDelete(t.sire);
      await softDelete(t.foal);

      await expect(rows(t.foal, 2)).resolves.toEqual([
        ['Mẹ', 1, 'DAM', t.foal],
        ['Ông Nội', 2, 'SIRE', t.dam],
      ]);
    });

    it('stops on pedigree data that already loops', async () => {
      const a = await seed.horse('A');
      const b = await seed.horse('B');
      await setParents(a, b, null);
      await setParents(b, a, null);

      await expect(rows(a, 2)).resolves.toEqual([['B', 1, 'SIRE', a]]);
    });
  });
});

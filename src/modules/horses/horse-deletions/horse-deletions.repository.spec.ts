import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EntityManager, getMetadataArgsStorage } from 'typeorm';
import { HORSE_BUSINESS_TABLES } from '../constants/horse.constants';
import { HorseDeletionsRepository } from './horse-deletions.repository';

const MODULES_DIR = join(__dirname, '..', '..');

function loadAllEntities(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) loadAllEntities(path);
    else if (entry.name.endsWith('.entity.ts')) jest.requireActual(path);
  }
}

function horseIdTables(): Set<string> {
  loadAllEntities(MODULES_DIR);
  const storage = getMetadataArgsStorage();
  const tables = new Set<string>();
  for (const table of storage.tables) {
    if (typeof table.target !== 'function' || !table.name) continue;
    const hasHorseId = storage
      .filterColumns(table.target)
      .some((column) => column.options.name === 'horse_id');
    if (hasHorseId) tables.add(table.name);
  }
  return tables;
}

describe('HorseDeletionsRepository', () => {
  it('only checks tables whose entity still has a horse_id column', () => {
    const withHorseId = horseIdTables();

    const broken = Object.keys(HORSE_BUSINESS_TABLES).filter(
      (table) => !withHorseId.has(table),
    );

    expect(broken).toEqual([]);
  });

  it('blocks deleting a horse that has ever joined a training class', () => {
    expect(HORSE_BUSINESS_TABLES.horse_enrollments).toBe('lớp học');
  });

  it('returns the labels of the tables that have rows for the horse', async () => {
    const tables = Object.keys(HORSE_BUSINESS_TABLES);
    const row = Object.fromEntries(
      tables.map((table) => [table, table === 'horse_enrollments']),
    );
    const query = jest.fn().mockResolvedValue([row]);
    const manager = { query } as unknown as EntityManager;

    const labels = await new HorseDeletionsRepository().businessDataLabels(
      'h1',
      manager,
    );

    expect(labels).toEqual(['lớp học']);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'EXISTS (SELECT 1 FROM horse_enrollments WHERE horse_id = $1)',
      ),
      ['h1'],
    );
  });
});

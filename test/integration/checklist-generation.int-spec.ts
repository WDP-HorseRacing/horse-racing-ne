import { ForbiddenException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import {
  CHECKLIST_GENERATION_FAILED_EVENT,
  CHECKLIST_GENERATION_RECOVERED_EVENT,
} from '../../src/modules/stable/constants/stable-events.constants';
import {
  ChecklistJob,
  checklistRetryName,
} from '../../src/modules/stable/constants/checklist-job.enum';
import { ChecklistGenerationService } from '../../src/modules/stable/daily-checklists/checklist-generation.service';
import { ChecklistsService } from '../../src/modules/stable/daily-checklists/checklists.service';
import { DailyChecklistEntity } from '../../src/modules/stable/entities/daily-checklist.entity';
import { DailyChecklistsService } from '../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Daily checklist generation retries (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let scheduler: SchedulerRegistry;
  let checklists: ChecklistsService;
  let generation: ChecklistGenerationService;
  let manager: Actor;
  let groom: Actor;
  let gio: string;
  let may: string;
  let today: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    await dataSource.query(`
      CREATE TABLE test_failing_horses (horse_id uuid PRIMARY KEY);
      CREATE TABLE test_failing_close (on_off boolean);
      CREATE FUNCTION test_fail_checklist_insert() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM test_failing_horses WHERE horse_id = NEW.horse_id) THEN
          RAISE EXCEPTION 'DB chập chờn';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_fail_checklist_insert BEFORE INSERT ON daily_checklists
        FOR EACH ROW EXECUTE FUNCTION test_fail_checklist_insert();
      CREATE FUNCTION test_fail_checklist_close() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM test_failing_close) THEN
          RAISE EXCEPTION 'DB chập chờn';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_fail_checklist_close BEFORE UPDATE ON daily_checklists
        FOR EACH ROW EXECUTE FUNCTION test_fail_checklist_close();
    `);
  });

  afterAll(async () => {
    await dataSource.query(`
      DROP TRIGGER test_fail_checklist_insert ON daily_checklists;
      DROP TRIGGER test_fail_checklist_close ON daily_checklists;
      DROP FUNCTION test_fail_checklist_insert();
      DROP FUNCTION test_fail_checklist_close();
      DROP TABLE test_failing_horses;
      DROP TABLE test_failing_close;
    `);
    await stopTestPostgres(db);
  });

  const actorOf = async (role: UserRole, id?: string): Promise<Actor> => {
    const userId = id ?? (await seed.user(role));
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const assignGroom = (horseId: string, groomId: string) =>
    dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [horseId, groomId],
    );

  const addTaskType = (name: string) =>
    dataSource.query(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active)
       VALUES (1, $1, true, true)`,
      [name],
    );

  const failHorse = (horseId: string) =>
    dataSource.query('INSERT INTO test_failing_horses VALUES ($1)', [horseId]);
  const healHorses = () => dataSource.query('DELETE FROM test_failing_horses');

  const checklistOf = async (horseId: string) => {
    const [row] = await dataSource.query<
      {
        id: string;
        status: string;
        items: number;
        done: number;
        updated_at: Date;
      }[]
    >(
      `SELECT c.id, c.status, c.updated_at,
              (SELECT COUNT(*) FROM daily_checklist_items i WHERE i.checklist_id = c.id)::int AS items,
              (SELECT COUNT(*) FROM daily_checklist_items i WHERE i.checklist_id = c.id AND i.done_at IS NOT NULL)::int AS done
         FROM daily_checklists c
        WHERE c.horse_id = $1 AND c.checklist_date = $2`,
      [horseId, today],
    );
    return row;
  };

  const eventsNamed = (name: string) =>
    dataSource.query<{ payload: { date: string; horseNames?: string[] } }[]>(
      'SELECT payload FROM outbox_events WHERE event_name = $1',
      [name],
    );

  const pending = (job: ChecklistJob) =>
    scheduler.doesExist('timeout', checklistRetryName(job));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await dataSource.query('DELETE FROM test_failing_close');
    scheduler = new SchedulerRegistry();
    const events = new DomainEventPublisher();
    checklists = new ChecklistsService(
      dataSource.getRepository(DailyChecklistEntity),
      new StableAccessService(new HorseAccessService(dataSource)),
      new DailyChecklistsService(events),
      dataSource,
      new AuditService(),
    );
    generation = new ChecklistGenerationService(
      checklists,
      dataSource,
      events,
      new AuditService(),
      scheduler,
    );
    today = clubToday();
    manager = await actorOf(UserRole.CLUB_MANAGER);
    const groomId = await seed.user(UserRole.GROOM);
    groom = await actorOf(UserRole.GROOM, groomId);
    const barn = await seed.barn('Khu A');
    gio = await seed.horse('Gió', { barnId: barn });
    may = await seed.horse('Mây', { barnId: barn });
    await assignGroom(gio, groomId);
    await assignGroom(may, groomId);
    await addTaskType('Cho ăn');
    await addTaskType('Vệ sinh chuồng');
  });

  afterEach(() => {
    for (const name of scheduler.getTimeouts()) scheduler.deleteTimeout(name);
  });

  it('retries only closing past days when that job fails and today is generated', async () => {
    await dataSource.query(
      `INSERT INTO daily_checklists (version, horse_id, groom_id, checklist_date, status)
       SELECT 1, horse_id, groom_id, $1, 'PENDING' FROM groom_assignments WHERE horse_id = $2`,
      [shiftDays(today, -1), gio],
    );
    await dataSource.query('INSERT INTO test_failing_close VALUES (true)');

    await generation.runDaily();

    expect(pending(ChecklistJob.CLOSE_PAST_DAYS)).toBe(true);
    expect(pending(ChecklistJob.GENERATE_TODAY)).toBe(false);
    expect(await checklistOf(gio)).toBeDefined();
    expect(await checklistOf(may)).toBeDefined();

    await dataSource.query('DELETE FROM test_failing_close');
    await generation.closePastDays(today, 2);

    expect(pending(ChecklistJob.CLOSE_PAST_DAYS)).toBe(false);
    await expect(
      dataSource.query(
        'SELECT status FROM daily_checklists WHERE checklist_date < $1',
        [today],
      ),
    ).resolves.toEqual([{ status: 'INCOMPLETE' }]);
  });

  it('retries only the horse that failed and leaves the generated checklist of the other horse as it was', async () => {
    await failHorse(may);

    const first = await generation.generateToday(today, 1);

    expect(first?.failures).toEqual([
      { horseId: may, horseName: 'Mây', message: 'DB chập chờn' },
    ]);
    expect(pending(ChecklistJob.GENERATE_TODAY)).toBe(true);
    const gioBefore = await checklistOf(gio);
    const [item] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM daily_checklist_items WHERE checklist_id = $1 ORDER BY position LIMIT 1',
      [gioBefore.id],
    );
    await checklists.tick(groom, item.id, { done: true });
    const ticked = await checklistOf(gio);
    await addTaskType('Tắm rửa');
    await healHorses();

    const retry = await generation.generateToday(today, 2);

    expect(retry).toEqual({ generated: 1, failures: [] });
    expect(pending(ChecklistJob.GENERATE_TODAY)).toBe(false);
    expect(await checklistOf(gio)).toEqual(ticked);
    expect(ticked).toMatchObject({
      id: gioBefore.id,
      items: 2,
      done: 1,
      status: 'IN_PROGRESS',
    });
    expect(await checklistOf(may)).toMatchObject({ items: 3, done: 0 });
  });

  it('tells the club manager once when the third run still fails, then once more when every checklist is there', async () => {
    await failHorse(may);

    await generation.generateToday(today, 1);
    await generation.generateToday(today, 2);
    expect(await eventsNamed(CHECKLIST_GENERATION_FAILED_EVENT)).toEqual([]);

    await generation.generateToday(today, 3);
    await generation.generateToday(today, 4);
    expect(await eventsNamed(CHECKLIST_GENERATION_FAILED_EVENT)).toEqual([
      {
        payload: expect.objectContaining({
          date: today,
          horseNames: ['Mây'],
        }) as unknown,
      },
    ]);
    expect(await eventsNamed(CHECKLIST_GENERATION_RECOVERED_EVENT)).toEqual([]);

    await healHorses();
    await generation.regenerateToday(manager);
    await generation.generateToday(today, 5);

    expect(await eventsNamed(CHECKLIST_GENERATION_RECOVERED_EVENT)).toEqual([
      { payload: expect.objectContaining({ date: today }) as unknown },
    ]);
    expect(await eventsNamed(CHECKLIST_GENERATION_FAILED_EVENT)).toHaveLength(
      1,
    );
    expect(pending(ChecklistJob.GENERATE_TODAY)).toBe(false);
  });

  it('tells nobody when the failure clears on the second run', async () => {
    await failHorse(may);
    await generation.generateToday(today, 1);
    await healHorses();

    await generation.generateToday(today, 2);

    expect(await eventsNamed(CHECKLIST_GENERATION_FAILED_EVENT)).toEqual([]);
    expect(await eventsNamed(CHECKLIST_GENERATION_RECOVERED_EVENT)).toEqual([]);
  });

  it('stops retrying once the club day has moved on', async () => {
    await failHorse(may);

    await expect(
      generation.generateToday(shiftDays(today, -1), 2),
    ).resolves.toBeNull();

    expect(pending(ChecklistJob.GENERATE_TODAY)).toBe(false);
    expect(await checklistOf(gio)).toBeUndefined();
  });

  it('lets the club manager regenerate only the missing horses, reports the ones still failing and records each press', async () => {
    await failHorse(may);
    await generation.generateToday(today, 1);
    const gioBefore = await checklistOf(gio);

    await expect(generation.regenerateToday(manager)).resolves.toEqual({
      date: today,
      generated: 0,
      failures: [{ horseId: may, horseName: 'Mây', message: 'DB chập chờn' }],
    });
    expect(pending(ChecklistJob.GENERATE_TODAY)).toBe(true);

    await healHorses();
    await expect(generation.regenerateToday(manager)).resolves.toEqual({
      date: today,
      generated: 1,
      failures: [],
    });

    expect(pending(ChecklistJob.GENERATE_TODAY)).toBe(false);
    expect(await checklistOf(gio)).toEqual(gioBefore);
    await expect(
      dataSource.query(
        `SELECT after_data->'generated' AS generated FROM audit_logs
          WHERE feature = 'CHECKLIST' AND entity_type = 'DAILY_CHECKLIST' ORDER BY created_at`,
      ),
    ).resolves.toEqual([{ generated: 0 }, { generated: 1 }]);
  });

  it('refuses the regenerate button to an account that is no longer active', async () => {
    const lockedId = await seed.user(UserRole.CLUB_MANAGER);
    const locked = await actorOf(UserRole.CLUB_MANAGER, lockedId);
    await dataSource.query(
      `UPDATE users SET status = 'INACTIVE' WHERE id = $1`,
      [lockedId],
    );

    await expect(generation.regenerateToday(locked)).rejects.toThrow(
      ForbiddenException,
    );
    expect(await checklistOf(gio)).toBeUndefined();
  });
});

import { DataSource } from 'typeorm';
import {
  startTestPostgres,
  stopTestPostgres,
  type TestPostgres,
} from './postgres';

/** Thứ tự khóa của guide mục 17, bảng đứng trước khóa trước */
const LOCK_ORDER = [
  'daily_fees',
  'daily_task_types',
  'training_subjects',
  'races',
  'supply_items',
  'supply_requests',
  'supply_lots',
  'supply_stock_movements',
  'barns',
  'stalls',
  'training_plans',
  'training_plan_phases',
  'training_plan_subjects',
  'training_classes',
  'training_class_phases',
  'training_class_phase_subjects',
  'training_sessions',
  'horses',
  'stall_assignments',
  'groom_assignments',
  'horse_enrollments',
  'session_participants',
  'trial_results',
  'performance_evaluations',
  'incidents',
  'medical_cases',
  'medical_records',
  'prescriptions',
  'injuries',
  'injury_markers',
  'medical_exam_requests',
  'training_locks',
  'care_schedules',
  'horse_measurements',
  'daily_checklists',
  'daily_checklist_items',
  'feeding_plans',
  'feeding_plan_items',
  'horse_daily_tasks',
  'horse_ownerships',
  'horse_surcharges',
  'race_registrations',
  'users',
];

/** Bảng không bao giờ bị khóa row trong luồng ghi */
const NOT_LOCKED = [
  'audit_logs',
  'media_assets',
  'migrations',
  'outbox_events',
  'performance_thresholds',
  'time_trials',
];

describe('Lock order follows foreign keys (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  it('places every table in the lock order or in the not-locked list', async () => {
    const rows = await dataSource.query<{ name: string }[]>(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'`,
    );
    const unknown = rows
      .map((row) => row.name)
      .filter(
        (name) => !LOCK_ORDER.includes(name) && !NOT_LOCKED.includes(name),
      )
      .sort();

    expect(unknown).toEqual([]);
  });

  it('locks every parent before its child, except references to users', async () => {
    const edges = await dataSource.query<{ child: string; parent: string }[]>(
      `SELECT DISTINCT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
         FROM pg_constraint
        WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
    );
    const wrong = edges
      .filter(
        ({ child, parent }) =>
          child !== parent &&
          parent !== 'users' &&
          LOCK_ORDER.includes(child) &&
          LOCK_ORDER.includes(parent) &&
          LOCK_ORDER.indexOf(parent) > LOCK_ORDER.indexOf(child),
      )
      .map(({ child, parent }) => `${child} -> ${parent}`)
      .sort();

    expect(wrong).toEqual([]);
  });
});

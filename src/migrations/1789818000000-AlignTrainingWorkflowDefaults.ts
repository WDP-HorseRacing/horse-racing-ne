import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keep database defaults aligned with the public training workflow.
 * Existing migrated classes remain ACTIVE; only future direct inserts use DRAFT.
 */
export class AlignTrainingWorkflowDefaults1789818000000
  implements MigrationInterface
{
  name = 'AlignTrainingWorkflowDefaults1789818000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The legacy schema allowed more than one TimeTrial row per session.
    // Keep the earliest configuration as the canonical one and move its
    // results there before enforcing the new one-to-one invariant. If two
    // legacy rows represented the same participant/attempt, keep the earliest
    // recorded result as the deterministic winner.
    await queryRunner.query(`
      WITH ranked_results AS (
        SELECT tr."id",
               ROW_NUMBER() OVER (
                 PARTITION BY tt."session_id", tr."session_participant_id", tr."attempt_no"
                 ORDER BY tr."recorded_at", tr."created_at", tr."id"
               ) AS row_no
          FROM "trial_results" tr
          JOIN "time_trials" tt ON tt."id" = tr."time_trial_id"
      )
      DELETE FROM "trial_results" tr
       USING ranked_results rr
       WHERE rr."id" = tr."id"
         AND rr.row_no > 1
    `);
    await queryRunner.query(`
      WITH canonical_trials AS (
        SELECT DISTINCT ON ("session_id")
               "session_id",
               "id" AS canonical_id
          FROM "time_trials"
         ORDER BY "session_id", "created_at", "id"
      )
      UPDATE "trial_results" tr
         SET "time_trial_id" = canonical.canonical_id
        FROM "time_trials" duplicate,
             canonical_trials canonical
       WHERE duplicate."id" = tr."time_trial_id"
         AND canonical."session_id" = duplicate."session_id"
         AND duplicate."id" <> canonical.canonical_id
    `);
    await queryRunner.query(`
      WITH canonical_trials AS (
        SELECT DISTINCT ON ("session_id")
               "session_id",
               "id" AS canonical_id
          FROM "time_trials"
         ORDER BY "session_id", "created_at", "id"
      )
      DELETE FROM "time_trials" duplicate
       USING canonical_trials canonical
       WHERE duplicate."session_id" = canonical."session_id"
         AND duplicate."id" <> canonical.canonical_id
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "time_trials_session_uq" ON "time_trials" ("session_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "training_classes"
      ALTER COLUMN "status" SET DEFAULT 'DRAFT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The index belongs to the refactor migration. Leave it for that
    // migration's down() so reverting this migration does not accidentally
    // remove an index that already existed before it ran.
    await queryRunner.query(`
      ALTER TABLE "training_classes"
      ALTER COLUMN "status" SET DEFAULT 'ACTIVE'
    `);
  }
}

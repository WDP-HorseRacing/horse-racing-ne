import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move the legacy horse -> plan -> session model to
 * class -> enrollment -> plan -> session -> participant.
 *
 * The migration deliberately keeps legacy source columns under a
 * `legacy_*` name after copying them. This makes the migration auditable and
 * avoids throwing away data that was not represented by the new model.
 */
export class TrainingClassParticipantRefactor1789816000000
  implements MigrationInterface
{
  name = 'TrainingClassParticipantRefactor1789816000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "training_classes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "club_id" uuid,
        "name" character varying(160) NOT NULL,
        "description" text,
        "head_trainer_id" uuid,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'ACTIVE',
        "legacy_plan_id" uuid,
        CONSTRAINT "PK_training_classes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "horse_enrollments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "class_id" uuid NOT NULL,
        "horse_id" uuid NOT NULL,
        "enrolled_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "left_at" TIMESTAMP WITH TIME ZONE,
        "status" character varying(32) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_horse_enrollments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "session_participants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "session_id" uuid NOT NULL,
        "horse_id" uuid NOT NULL,
        "horse_enrollment_id" uuid NOT NULL,
        "assigned_groom_id" uuid,
        "status" character varying(32) NOT NULL DEFAULT 'PLANNED',
        "checked_in_at" TIMESTAMP WITH TIME ZONE,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "absence_reason" text,
        "cancel_reason" text,
        "ineligibility_reason" character varying(64),
        CONSTRAINT "PK_session_participants" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "trial_results" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "time_trial_id" uuid NOT NULL,
        "session_participant_id" uuid NOT NULL,
        "attempt_no" integer NOT NULL,
        "elapsed_ms" bigint NOT NULL,
        "notes" text,
        "video_media_id" uuid,
        "recorded_by" uuid NOT NULL,
        "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_trial_results" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`ALTER TABLE "training_plans" ADD COLUMN "class_id" uuid`);
    await queryRunner.query(`ALTER TABLE "training_plans" ADD COLUMN "name" character varying(160)`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ADD COLUMN "name" character varying(160)`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ADD COLUMN "session_type" character varying(32) NOT NULL DEFAULT 'REGULAR'`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ADD COLUMN "scheduled_start_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ADD COLUMN "scheduled_end_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ADD COLUMN "location" character varying(160)`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ADD COLUMN "notes" text`);
    await queryRunner.query(`ALTER TABLE "time_trials" ADD COLUMN "distance_m" numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "time_trials" ADD COLUMN "target_time_ms" bigint`);
    await queryRunner.query(`ALTER TABLE "performance_metrics" ADD COLUMN "session_participant_id" uuid`);
    await queryRunner.query(`ALTER TABLE "performance_evaluations" ADD COLUMN "session_participant_id" uuid`);

    // One legacy plan becomes one class. This is deterministic and does not
    // guess that two unrelated legacy plans belonged to the same class.
    await queryRunner.query(`
      INSERT INTO "training_classes"
        ("club_id", "name", "description", "start_date", "end_date", "status", "legacy_plan_id")
      SELECT NULL,
             'Legacy class ' || p."id"::text,
             'Tạo tự động khi migrate Training plan cũ',
             p."start_date",
             p."end_date",
             'ACTIVE',
             p."id"
        FROM "training_plans" p
    `);
    await queryRunner.query(`
      UPDATE "training_classes" c
         SET "head_trainer_id" = p."created_by"
        FROM "training_plans" p
       WHERE c."legacy_plan_id" = p."id"
         AND EXISTS (
           SELECT 1 FROM "users" u
            WHERE u."id" = p."created_by"
              AND u."role" = 'HEAD_TRAINER'
         )
    `);
    await queryRunner.query(`
      UPDATE "training_plans" p
         SET "class_id" = c."id",
             "name" = COALESCE(NULLIF(p."phase_name", ''), 'Legacy plan ' || p."id"::text)
        FROM "training_classes" c
       WHERE c."legacy_plan_id" = p."id"
    `);
    await queryRunner.query(`ALTER TABLE "training_classes" DROP COLUMN "legacy_plan_id"`);

    await queryRunner.query(`
      INSERT INTO "horse_enrollments"
        ("class_id", "horse_id", "enrolled_at", "status")
      SELECT p."class_id", p."horse_id", p."start_date"::timestamptz, 'ACTIVE'
        FROM "training_plans" p
    `);

    // Preserve the legacy schedule and derive an end time. A one-hour
    // fallback is used only where the old schema had no duration.
    await queryRunner.query(`
      UPDATE "training_sessions" s
         SET "name" = 'Legacy session ' || s."id"::text,
             "scheduled_start_at" = s."scheduled_at",
             "scheduled_end_at" = s."scheduled_at" + make_interval(mins => COALESCE(s."planned_duration_minutes", 60)),
             "location" = NULL,
             "notes" = s."completion_notes"
    `);

    await queryRunner.query(`
      INSERT INTO "session_participants"
        ("session_id", "horse_id", "horse_enrollment_id", "assigned_groom_id",
         "status", "checked_in_at", "started_at", "completed_at")
      SELECT s."id",
             p."horse_id",
             e."id",
             s."groom_id",
             CASE s."status"
               WHEN 'IN_PROGRESS' THEN 'ONGOING'
               WHEN 'COMPLETED' THEN 'COMPLETED'
               WHEN 'CANCELLED' THEN 'CANCELLED'
               ELSE 'PLANNED'
             END,
             s."started_at",
             s."started_at",
             s."completed_at"
        FROM "training_sessions" s
        JOIN "training_plans" p ON p."id" = s."plan_id"
        JOIN "horse_enrollments" e
          ON e."class_id" = p."class_id"
         AND e."horse_id" = p."horse_id"
    `);

    await queryRunner.query(`
      UPDATE "time_trials" tt
         SET "distance_m" = tt."distance_meters"
    `);
    await queryRunner.query(`
      INSERT INTO "trial_results"
        ("time_trial_id", "session_participant_id", "attempt_no", "elapsed_ms",
         "notes", "video_media_id", "recorded_by", "recorded_at")
      SELECT tt."id",
             sp."id",
             1,
             ROUND(tt."duration_seconds" * 1000)::bigint,
             tt."notes",
             tt."video_asset_id",
             p."created_by",
             tt."created_at"
        FROM "time_trials" tt
        JOIN "training_sessions" s ON s."id" = tt."session_id"
        JOIN "training_plans" p ON p."id" = s."plan_id"
        JOIN "session_participants" sp ON sp."session_id" = s."id"
    `);

    await queryRunner.query(`
      UPDATE "performance_metrics" m
         SET "session_participant_id" = sp."id"
        FROM "session_participants" sp
       WHERE sp."session_id" = m."session_id"
    `);
    await queryRunner.query(`
      UPDATE "performance_evaluations" e
         SET "session_participant_id" = sp."id"
        FROM "session_participants" sp
       WHERE sp."session_id" = e."session_id"
    `);

    await queryRunner.query(`ALTER TABLE "training_plans" ALTER COLUMN "class_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "training_plans" ALTER COLUMN "name" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ALTER COLUMN "name" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ALTER COLUMN "scheduled_start_at" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "training_sessions" ALTER COLUMN "scheduled_end_at" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "time_trials" ALTER COLUMN "distance_m" SET NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE "training_plans" DROP CONSTRAINT IF EXISTS "FK_f8d78a00b5a5ba90f043044dc9b"
    `);
    await queryRunner.query(`ALTER TABLE "training_plans" RENAME COLUMN "horse_id" TO "legacy_horse_id"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" DROP CONSTRAINT IF EXISTS "FK_d64978ddc49313e0aa9979bca9d"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" RENAME COLUMN "groom_id" TO "legacy_groom_id"`);
    await queryRunner.query(`ALTER TABLE "time_trials" DROP CONSTRAINT IF EXISTS "FK_38b16008b226ef05c6c5b200778"`);
    await queryRunner.query(`ALTER TABLE "time_trials" DROP CONSTRAINT IF EXISTS "FK_200aaf44157db869b56448527d9"`);
    await queryRunner.query(`ALTER TABLE "time_trials" RENAME COLUMN "distance_meters" TO "legacy_distance_meters"`);
    await queryRunner.query(`ALTER TABLE "time_trials" RENAME COLUMN "duration_seconds" TO "legacy_duration_seconds"`);
    await queryRunner.query(`ALTER TABLE "time_trials" RENAME COLUMN "video_asset_id" TO "legacy_video_asset_id"`);
    await queryRunner.query(`
      ALTER TABLE "time_trials"
        ADD CONSTRAINT "FK_time_trials_session"
        FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`ALTER TABLE "performance_metrics" DROP CONSTRAINT IF EXISTS "FK_ea4a140e8c2814976d70ed79ffb"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "performance_metrics_source_uq"`);
    await queryRunner.query(`ALTER TABLE "performance_metrics" RENAME COLUMN "session_id" TO "legacy_session_id"`);
    await queryRunner.query(`ALTER TABLE "performance_evaluations" DROP CONSTRAINT IF EXISTS "FK_fe45da97f7584f089013c193f36"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "performance_evaluations_session_uq"`);
    await queryRunner.query(`ALTER TABLE "performance_evaluations" RENAME COLUMN "session_id" TO "legacy_session_id"`);

    await queryRunner.query(`
      ALTER TABLE "training_classes"
        ADD CONSTRAINT "FK_training_classes_head_trainer"
        FOREIGN KEY ("head_trainer_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "training_plans"
        ADD CONSTRAINT "FK_training_plans_class"
        FOREIGN KEY ("class_id") REFERENCES "training_classes"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "horse_enrollments"
        ADD CONSTRAINT "FK_horse_enrollments_class"
        FOREIGN KEY ("class_id") REFERENCES "training_classes"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_horse_enrollments_horse"
        FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "session_participants"
        ADD CONSTRAINT "FK_session_participants_session"
        FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_session_participants_horse"
        FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_session_participants_enrollment"
        FOREIGN KEY ("horse_enrollment_id") REFERENCES "horse_enrollments"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_session_participants_groom"
        FOREIGN KEY ("assigned_groom_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "trial_results"
        ADD CONSTRAINT "FK_trial_results_time_trial"
        FOREIGN KEY ("time_trial_id") REFERENCES "time_trials"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_trial_results_participant"
        FOREIGN KEY ("session_participant_id") REFERENCES "session_participants"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_trial_results_video"
        FOREIGN KEY ("video_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_trial_results_recorder"
        FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "performance_metrics"
        ADD CONSTRAINT "FK_performance_metrics_participant"
        FOREIGN KEY ("session_participant_id") REFERENCES "session_participants"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "performance_evaluations"
        ADD CONSTRAINT "FK_performance_evaluations_participant"
        FOREIGN KEY ("session_participant_id") REFERENCES "session_participants"("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX "training_plans_active_class_uq" ON "training_plans" ("class_id") WHERE "status" = 'ACTIVE'`);
    await queryRunner.query(`CREATE UNIQUE INDEX "horse_enrollments_active_uq" ON "horse_enrollments" ("class_id", "horse_id") WHERE "status" = 'ACTIVE'`);
    await queryRunner.query(`CREATE UNIQUE INDEX "session_participants_session_horse_uq" ON "session_participants" ("session_id", "horse_id")`);
    await queryRunner.query(`CREATE INDEX "session_participants_horse_status_idx" ON "session_participants" ("horse_id", "status")`);
    await queryRunner.query(`CREATE INDEX "session_participants_groom_status_idx" ON "session_participants" ("assigned_groom_id", "status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "trial_results_attempt_uq" ON "trial_results" ("time_trial_id", "session_participant_id", "attempt_no")`);
    const duplicateTimeTrials: Array<{ session_id: string }> = await queryRunner.query(
      `SELECT "session_id" FROM "time_trials" GROUP BY "session_id" HAVING COUNT(*) > 1`,
    );
    if (duplicateTimeTrials.length === 0) {
      await queryRunner.query(`CREATE UNIQUE INDEX "time_trials_session_uq" ON "time_trials" ("session_id")`);
    }
    await queryRunner.query(`CREATE UNIQUE INDEX "performance_metrics_source_uq" ON "performance_metrics" ("session_participant_id", "recorded_at", "source_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "performance_evaluations_participant_uq" ON "performance_evaluations" ("session_participant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "time_trials_session_uq"`);
    await queryRunner.query(`ALTER TABLE "time_trials" DROP CONSTRAINT IF EXISTS "FK_time_trials_session"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "performance_evaluations_participant_uq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "performance_metrics_source_uq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "trial_results_attempt_uq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "session_participants_groom_status_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "session_participants_horse_status_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "session_participants_session_horse_uq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "horse_enrollments_active_uq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "training_plans_active_class_uq"`);
    await queryRunner.query(`ALTER TABLE "performance_evaluations" DROP CONSTRAINT IF EXISTS "FK_performance_evaluations_participant"`);
    await queryRunner.query(`ALTER TABLE "performance_metrics" DROP CONSTRAINT IF EXISTS "FK_performance_metrics_participant"`);
    await queryRunner.query(`ALTER TABLE "trial_results" DROP CONSTRAINT IF EXISTS "FK_trial_results_recorder"`);
    await queryRunner.query(`ALTER TABLE "trial_results" DROP CONSTRAINT IF EXISTS "FK_trial_results_video"`);
    await queryRunner.query(`ALTER TABLE "trial_results" DROP CONSTRAINT IF EXISTS "FK_trial_results_participant"`);
    await queryRunner.query(`ALTER TABLE "trial_results" DROP CONSTRAINT IF EXISTS "FK_trial_results_time_trial"`);
    await queryRunner.query(`ALTER TABLE "session_participants" DROP CONSTRAINT IF EXISTS "FK_session_participants_groom"`);
    await queryRunner.query(`ALTER TABLE "session_participants" DROP CONSTRAINT IF EXISTS "FK_session_participants_enrollment"`);
    await queryRunner.query(`ALTER TABLE "session_participants" DROP CONSTRAINT IF EXISTS "FK_session_participants_horse"`);
    await queryRunner.query(`ALTER TABLE "session_participants" DROP CONSTRAINT IF EXISTS "FK_session_participants_session"`);
    await queryRunner.query(`ALTER TABLE "horse_enrollments" DROP CONSTRAINT IF EXISTS "FK_horse_enrollments_horse"`);
    await queryRunner.query(`ALTER TABLE "horse_enrollments" DROP CONSTRAINT IF EXISTS "FK_horse_enrollments_class"`);
    await queryRunner.query(`ALTER TABLE "training_plans" DROP CONSTRAINT IF EXISTS "FK_training_plans_class"`);
    await queryRunner.query(`ALTER TABLE "training_classes" DROP CONSTRAINT IF EXISTS "FK_training_classes_head_trainer"`);
    await queryRunner.query(`ALTER TABLE "performance_evaluations" RENAME COLUMN "legacy_session_id" TO "session_id"`);
    await queryRunner.query(`ALTER TABLE "performance_metrics" RENAME COLUMN "legacy_session_id" TO "session_id"`);
    await queryRunner.query(`ALTER TABLE "time_trials" RENAME COLUMN "legacy_video_asset_id" TO "video_asset_id"`);
    await queryRunner.query(`ALTER TABLE "time_trials" RENAME COLUMN "legacy_duration_seconds" TO "duration_seconds"`);
    await queryRunner.query(`ALTER TABLE "time_trials" RENAME COLUMN "legacy_distance_meters" TO "distance_meters"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" RENAME COLUMN "legacy_groom_id" TO "groom_id"`);
    await queryRunner.query(`ALTER TABLE "training_plans" RENAME COLUMN "legacy_horse_id" TO "horse_id"`);
    await queryRunner.query(`ALTER TABLE "performance_evaluations" DROP COLUMN "session_participant_id"`);
    await queryRunner.query(`ALTER TABLE "performance_metrics" DROP COLUMN "session_participant_id"`);
    await queryRunner.query(`ALTER TABLE "time_trials" DROP COLUMN "target_time_ms"`);
    await queryRunner.query(`ALTER TABLE "time_trials" DROP COLUMN "distance_m"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" DROP COLUMN "notes"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" DROP COLUMN "location"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" DROP COLUMN "scheduled_end_at"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" DROP COLUMN "scheduled_start_at"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" DROP COLUMN "session_type"`);
    await queryRunner.query(`ALTER TABLE "training_sessions" DROP COLUMN "name"`);
    await queryRunner.query(`ALTER TABLE "training_plans" DROP COLUMN "name"`);
    await queryRunner.query(`ALTER TABLE "training_plans" DROP COLUMN "class_id"`);
    await queryRunner.query(`DROP TABLE "trial_results"`);
    await queryRunner.query(`DROP TABLE "session_participants"`);
    await queryRunner.query(`DROP TABLE "horse_enrollments"`);
    await queryRunner.query(`DROP TABLE "training_classes"`);
  }
}

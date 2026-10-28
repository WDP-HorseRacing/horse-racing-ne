import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceTrainingClassFields1789817000000 implements MigrationInterface {
  name = 'EnhanceTrainingClassFields1789817000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "training_classes"
      ADD COLUMN IF NOT EXISTS "code" character varying(32),
      ADD COLUMN IF NOT EXISTS "race_aptitude" character varying(16),
      ADD COLUMN IF NOT EXISTS "max_horses" integer NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "cancel_reason" text;
    `);

    // Backfill code for existing rows if any
    await queryRunner.query(`
      UPDATE "training_classes"
         SET "code" = UPPER(CONCAT('TC-', SUBSTRING("id"::text, 1, 8)))
       WHERE "code" IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "training_classes"
      ALTER COLUMN "code" SET NOT NULL;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_training_classes_code'
        ) THEN
          ALTER TABLE "training_classes" ADD CONSTRAINT "UQ_training_classes_code" UNIQUE ("code");
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "training_classes" DROP COLUMN IF EXISTS "club_id";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "training_classes"
      ADD COLUMN IF NOT EXISTS "club_id" uuid;
    `);

    await queryRunner.query(`
      ALTER TABLE "training_classes"
      DROP CONSTRAINT IF EXISTS "UQ_training_classes_code",
      DROP COLUMN IF EXISTS "cancel_reason",
      DROP COLUMN IF EXISTS "cancelled_at",
      DROP COLUMN IF EXISTS "completed_at",
      DROP COLUMN IF EXISTS "max_horses",
      DROP COLUMN IF EXISTS "race_aptitude",
      DROP COLUMN IF EXISTS "code";
    `);
  }
}

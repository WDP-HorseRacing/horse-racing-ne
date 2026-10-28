import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutboxEvents1789824000000 implements MigrationInterface {
  name = 'CreateOutboxEvents1789824000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_name" character varying(120) NOT NULL, "payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "attempts" integer NOT NULL DEFAULT 0, "processed_at" TIMESTAMP WITH TIME ZONE, "dead_at" TIMESTAMP WITH TIME ZONE, "last_error" text, CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" ("next_attempt_at") WHERE processed_at IS NULL AND dead_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "outbox_events_processed_idx" ON "outbox_events" ("processed_at") WHERE processed_at IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."outbox_events_processed_idx"`,
    );
    await queryRunner.query(`DROP INDEX "public"."outbox_events_pending_idx"`);
    await queryRunner.query(`DROP TABLE "outbox_events"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPerformanceMetricsTable1789824200000 implements MigrationInterface {
  name = 'DropPerformanceMetricsTable1789824200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "performance_metrics"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "performance_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "legacy_session_id" uuid, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "source_id" character varying(80) NOT NULL, "heart_rate_bpm" smallint NOT NULL, "speed_mps" numeric(8,3) NOT NULL, "alert_level" character varying(16) NOT NULL DEFAULT 'NORMAL', "session_participant_id" uuid, CONSTRAINT "PK_66237d8c606d64c7bd44a91f74a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "performance_metrics_source_uq" ON "performance_metrics" ("session_participant_id", "recorded_at", "source_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_metrics" ADD CONSTRAINT "FK_performance_metrics_participant" FOREIGN KEY ("session_participant_id") REFERENCES "session_participants"("id") ON DELETE RESTRICT`,
    );
  }
}

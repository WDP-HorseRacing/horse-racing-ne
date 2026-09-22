import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitGroomAssignments1789811320676 implements MigrationInterface {
  name = 'SplitGroomAssignments1789811320676';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "groom_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "groom_id" uuid NOT NULL, "start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7c45fd5ca33d724696a6cd0f79b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "groom_assignments_groom_active_idx" ON "groom_assignments" ("groom_id", "end_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "groom_assignments_active_horse_uq" ON "groom_assignments" ("horse_id") WHERE end_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "groom_assignments" ADD CONSTRAINT "FK_2044fe5eb0e4dd99344540e3235" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "groom_assignments" ADD CONSTRAINT "FK_5086270d70224dfd7ad4d9c697a" FOREIGN KEY ("groom_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "groom_assignments" ("horse_id", "groom_id", "start_at", "end_at", "version") SELECT "horse_id", "groom_id", "start_at", "end_at", 1 FROM "stall_assignments"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "groom_assignments" DROP CONSTRAINT "FK_5086270d70224dfd7ad4d9c697a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groom_assignments" DROP CONSTRAINT "FK_2044fe5eb0e4dd99344540e3235"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."groom_assignments_active_horse_uq"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."groom_assignments_groom_active_idx"`,
    );
    await queryRunner.query(`DROP TABLE "groom_assignments"`);
  }
}

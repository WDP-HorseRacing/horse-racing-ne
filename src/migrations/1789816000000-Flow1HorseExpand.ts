import { MigrationInterface, QueryRunner } from 'typeorm';

export class Flow1HorseExpand1789816000000 implements MigrationInterface {
  name = 'Flow1HorseExpand1789816000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "horses" ADD "owner_id" uuid`);
    await queryRunner.query(`ALTER TABLE "horses" ADD "barn_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "horses_owner_idx" ON "horses" ("owner_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "horses_barn_idx" ON "horses" ("barn_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD CONSTRAINT "horses_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD CONSTRAINT "horses_barn_fk" FOREIGN KEY ("barn_id") REFERENCES "barns"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `UPDATE "horses" h SET "owner_id" = o."owner_id"
       FROM (
         SELECT DISTINCT ON ("horse_id") "horse_id", "owner_id"
         FROM "horse_ownerships"
         WHERE "end_at" IS NULL
         ORDER BY "horse_id", "is_representative" DESC, "percentage" DESC, "start_at" ASC
       ) o
       WHERE o."horse_id" = h."id"`,
    );
    await queryRunner.query(
      `UPDATE "horses" h SET "barn_id" = s."barn_id"
       FROM "stall_assignments" sa
       JOIN "stalls" s ON s."id" = sa."stall_id"
       WHERE sa."horse_id" = h."id" AND sa."end_at" IS NULL`,
    );

    await queryRunner.query(`DROP INDEX "public"."horses_microchip_uq"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "horses_microchip_uq" ON "horses" ("microchip_id") WHERE microchip_id IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD "source" character varying(16) NOT NULL DEFAULT 'MANUAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD "medical_record_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD "delete_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD "deleted_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD CONSTRAINT "horse_measurements_medical_record_fk" FOREIGN KEY ("medical_record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD CONSTRAINT "horse_measurements_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP CONSTRAINT "horse_measurements_deleted_by_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP CONSTRAINT "horse_measurements_medical_record_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP COLUMN "deleted_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP COLUMN "delete_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP COLUMN "medical_record_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP COLUMN "source"`,
    );

    await queryRunner.query(`DROP INDEX "public"."horses_microchip_uq"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "horses_microchip_uq" ON "horses" ("microchip_id") WHERE microchip_id IS NOT NULL AND deleted_at IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "horses" DROP CONSTRAINT "horses_barn_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" DROP CONSTRAINT "horses_owner_fk"`,
    );
    await queryRunner.query(`DROP INDEX "public"."horses_barn_idx"`);
    await queryRunner.query(`DROP INDEX "public"."horses_owner_idx"`);
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "barn_id"`);
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "owner_id"`);
  }
}

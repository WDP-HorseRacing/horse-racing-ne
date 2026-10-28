import { MigrationInterface, QueryRunner } from 'typeorm';

export class Flow1HorseContract1789818000000 implements MigrationInterface {
  name = 'Flow1HorseContract1789818000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "horses" SET "sire_id" = NULL WHERE "sire_id" IN (SELECT "id" FROM "horses" WHERE "is_reference")`,
    );
    await queryRunner.query(
      `UPDATE "horses" SET "dam_id" = NULL WHERE "dam_id" IN (SELECT "id" FROM "horses" WHERE "is_reference")`,
    );
    await queryRunner.query(
      `UPDATE "horses" SET "deleted_at" = now(), "deleted_reason" = 'Bỏ ngựa tham chiếu theo Flow 1 mới' WHERE "is_reference" AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "is_reference"`);
    await queryRunner.query(`DROP TABLE "horse_ownerships"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "horse_ownerships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "owner_id" uuid NOT NULL, "percentage" numeric(5,2) NOT NULL, "start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE, "is_representative" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_be43a225b8cfc55c7c38f8a48d0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "horse_ownerships_active_rep_uq" ON "horse_ownerships" ("horse_id") WHERE is_representative AND end_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_ownerships_horse_active_idx" ON "horse_ownerships" ("horse_id", "end_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_ownerships_owner_active_idx" ON "horse_ownerships" ("owner_id", "end_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD CONSTRAINT "FK_3e221b15f14a65f4d32cb42e90a" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD CONSTRAINT "FK_d1e3d66782bccda90ac5112c0ed" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "horse_ownerships" ("horse_id", "owner_id", "percentage", "start_at", "is_representative", "version") SELECT "id", "owner_id", 100, now(), true, 1 FROM "horses" WHERE "owner_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD "is_reference" boolean NOT NULL DEFAULT false`,
    );
  }
}

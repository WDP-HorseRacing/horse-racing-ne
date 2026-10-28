import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedingPlanItems1789826100000 implements MigrationInterface {
  name = 'FeedingPlanItems1789826100000';

  /**
   * Đổi khẩu phần sang dòng theo bữa và món vật tư, thêm người lập và thời điểm hết hiệu lực
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "feeding_plans"`);
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" DROP COLUMN "ration", DROP COLUMN "effective_from", DROP COLUMN "effective_to"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" ADD "note" text, ADD "created_by" uuid NOT NULL, ADD "archived_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" ADD CONSTRAINT "feeding_plans_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "feeding_plans_horse_created_idx" ON "feeding_plans" ("horse_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "feeding_plans_horse_active_uq" ON "feeding_plans" ("horse_id") WHERE status = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE TABLE "feeding_plan_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "plan_id" uuid NOT NULL, "meal" character varying(32) NOT NULL, "supply_item_id" uuid NOT NULL, "quantity" numeric(12,2) NOT NULL, "note" character varying(200), "position" smallint NOT NULL, CONSTRAINT "feeding_plan_items_quantity_positive_ck" CHECK ("quantity" > 0), CONSTRAINT "PK_feeding_plan_items" PRIMARY KEY ("id"), CONSTRAINT "feeding_plan_items_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "feeding_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "feeding_plan_items_supply_item_fk" FOREIGN KEY ("supply_item_id") REFERENCES "supply_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "feeding_plan_items_plan_meal_item_uq" ON "feeding_plan_items" ("plan_id", "meal", "supply_item_id")`,
    );
  }

  /**
   * Trả khẩu phần về dạng jsonb một cột, bỏ bảng dòng khẩu phần
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "feeding_plan_items"`);
    await queryRunner.query(`DELETE FROM "feeding_plans"`);
    await queryRunner.query(`DROP INDEX "feeding_plans_horse_active_uq"`);
    await queryRunner.query(`DROP INDEX "feeding_plans_horse_created_idx"`);
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" DROP CONSTRAINT "feeding_plans_created_by_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" DROP COLUMN "archived_at", DROP COLUMN "created_by", DROP COLUMN "note"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" ADD "effective_from" date NOT NULL, ADD "effective_to" date, ADD "ration" jsonb NOT NULL`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyChecklistItems1789826200000 implements MigrationInterface {
  name = 'DailyChecklistItems1789826200000';

  /**
   * Thêm danh mục loại việc, việc riêng của ngựa, dòng checklist; checklist có trạng thái và mỗi ngựa một checklist mỗi ngày
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và thêm bốn loại việc mặc định
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "care_task_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "name" character varying(80) NOT NULL, "applies_to_all" boolean NOT NULL, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_care_task_types" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "care_task_types_name_uq" ON "care_task_types" ("name")`,
    );
    await queryRunner.query(
      `INSERT INTO "care_task_types" ("version", "name", "applies_to_all", "created_at", "updated_at")
       VALUES (1, 'Cho ăn', true, now(), now()),
              (1, 'Vệ sinh chuồng', true, now() + interval '1 millisecond', now()),
              (1, 'Tắm rửa', true, now() + interval '2 millisecond', now()),
              (1, 'Ngâm chân nước đá', false, now() + interval '3 millisecond', now())`,
    );
    await queryRunner.query(
      `CREATE TABLE "horse_care_tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "horse_id" uuid NOT NULL, "task_type_id" uuid NOT NULL, "from_date" date NOT NULL, "to_date" date NOT NULL, "note" character varying(200), "created_by" uuid NOT NULL, CONSTRAINT "horse_care_tasks_date_range_ck" CHECK ("from_date" <= "to_date"), CONSTRAINT "PK_horse_care_tasks" PRIMARY KEY ("id"), CONSTRAINT "horse_care_tasks_horse_fk" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "horse_care_tasks_task_type_fk" FOREIGN KEY ("task_type_id") REFERENCES "care_task_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "horse_care_tasks_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_care_tasks_horse_dates_idx" ON "horse_care_tasks" ("horse_id", "from_date", "to_date")`,
    );
    await queryRunner.query(`DELETE FROM "daily_checklists"`);
    await queryRunner.query(
      `DROP INDEX "public"."daily_checklists_horse_groom_date_uq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklists" DROP COLUMN "items", ADD "status" character varying(16) NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "daily_checklists_horse_date_uq" ON "daily_checklists" ("horse_id", "checklist_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "daily_checklists_groom_date_idx" ON "daily_checklists" ("groom_id", "checklist_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "daily_checklists_status_date_idx" ON "daily_checklists" ("status", "checklist_date")`,
    );
    await queryRunner.query(
      `CREATE TABLE "daily_checklist_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "checklist_id" uuid NOT NULL, "task_type_id" uuid NOT NULL, "position" smallint NOT NULL, "done_at" TIMESTAMP WITH TIME ZONE, "done_by" uuid, "note" character varying(200), CONSTRAINT "PK_daily_checklist_items" PRIMARY KEY ("id"), CONSTRAINT "daily_checklist_items_checklist_fk" FOREIGN KEY ("checklist_id") REFERENCES "daily_checklists"("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "daily_checklist_items_task_type_fk" FOREIGN KEY ("task_type_id") REFERENCES "care_task_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "daily_checklist_items_done_by_fk" FOREIGN KEY ("done_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "daily_checklist_items_checklist_type_uq" ON "daily_checklist_items" ("checklist_id", "task_type_id")`,
    );
  }

  /**
   * Bỏ dòng checklist, việc riêng, danh mục loại việc; checklist trả về dạng jsonb
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "daily_checklist_items"`);
    await queryRunner.query(`DELETE FROM "daily_checklists"`);
    await queryRunner.query(`DROP INDEX "daily_checklists_status_date_idx"`);
    await queryRunner.query(`DROP INDEX "daily_checklists_groom_date_idx"`);
    await queryRunner.query(`DROP INDEX "daily_checklists_horse_date_uq"`);
    await queryRunner.query(
      `ALTER TABLE "daily_checklists" DROP COLUMN "status", ADD "items" jsonb NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "daily_checklists_horse_groom_date_uq" ON "daily_checklists" ("horse_id", "groom_id", "checklist_date")`,
    );
    await queryRunner.query(`DROP TABLE "horse_care_tasks"`);
    await queryRunner.query(`DROP TABLE "care_task_types"`);
  }
}

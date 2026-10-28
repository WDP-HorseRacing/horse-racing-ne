import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorseSurcharges1789827300000 implements MigrationInterface {
  name = 'HorseSurcharges1789827300000';

  /**
   * Thêm bảng phụ phí chăm sóc riêng của từng ngựa, kèm người và lúc Head Trainer xác nhận đã áp dụng
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "horse_surcharges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "description" character varying(500) NOT NULL, "daily_amount" bigint NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "created_by" uuid NOT NULL, "applied_by" uuid, "applied_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "horse_surcharges_applied_ck" CHECK (("applied_by" IS NULL) = ("applied_at" IS NULL)), CONSTRAINT "horse_surcharges_daily_amount_positive_ck" CHECK ("daily_amount" > 0), CONSTRAINT "horse_surcharges_dates_ck" CHECK ("end_date" >= "start_date"), CONSTRAINT "PK_horse_surcharges" PRIMARY KEY ("id"), CONSTRAINT "horse_surcharges_horse_fk" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "horse_surcharges_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "horse_surcharges_applied_by_fk" FOREIGN KEY ("applied_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_surcharges_horse_idx" ON "horse_surcharges" ("horse_id", "start_date")`,
    );
  }

  /**
   * Bỏ bảng phụ phí chăm sóc riêng của từng ngựa
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "horse_surcharges"`);
  }
}

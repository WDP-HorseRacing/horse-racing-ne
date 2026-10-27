import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyFees1789826700000 implements MigrationInterface {
  name = 'DailyFees1789826700000';

  /**
   * Thêm bảng mức phí nuôi ngựa theo ngày của CLB
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "daily_fees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "effective_from" date NOT NULL, "daily_fee" bigint NOT NULL, "created_by" uuid NOT NULL, CONSTRAINT "daily_fees_daily_fee_nonnegative_ck" CHECK ("daily_fee" >= 0), CONSTRAINT "PK_daily_fees" PRIMARY KEY ("id"), CONSTRAINT "daily_fees_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "daily_fees_effective_from_uq" ON "daily_fees" ("effective_from")`,
    );
  }

  /**
   * Bỏ bảng mức phí nuôi ngựa theo ngày
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "daily_fees"`);
  }
}

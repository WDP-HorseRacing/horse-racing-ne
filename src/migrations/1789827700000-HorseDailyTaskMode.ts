import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorseDailyTaskMode1789827700000 implements MigrationInterface {
  name = 'HorseDailyTaskMode1789827700000';

  /**
   * Thêm kiểu dòng việc riêng (gắn thêm hoặc miễn); dòng cũ là gắn thêm
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã thêm cột
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_daily_tasks" ADD "mode" character varying(16) NOT NULL DEFAULT 'EXTRA'`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_daily_tasks" ADD CONSTRAINT "horse_daily_tasks_mode_ck" CHECK ("mode" IN ('EXTRA', 'EXEMPT'))`,
    );
  }

  /**
   * Bỏ kiểu dòng việc riêng; dòng miễn bị xóa vì không còn nghĩa
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã bỏ cột
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "horse_daily_tasks" WHERE "mode" = 'EXEMPT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_daily_tasks" DROP CONSTRAINT "horse_daily_tasks_mode_ck"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_daily_tasks" DROP COLUMN "mode"`,
    );
  }
}

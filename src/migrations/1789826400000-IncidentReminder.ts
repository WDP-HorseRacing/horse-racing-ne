import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncidentReminder1789826400000 implements MigrationInterface {
  name = 'IncidentReminder1789826400000';

  /**
   * Thêm thời điểm đã nhắc sự cố quá hạn; bỏ cột khẩn của sự cố
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD "reminded_at" TIMESTAMP WITH TIME ZONE, DROP COLUMN "urgent"`,
    );
  }

  /**
   * Bỏ thời điểm đã nhắc sự cố quá hạn; trả lại cột khẩn của sự cố
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP COLUMN "reminded_at", ADD "urgent" boolean NOT NULL DEFAULT false`,
    );
  }
}

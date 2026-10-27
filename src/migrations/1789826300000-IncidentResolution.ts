import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncidentResolution1789826300000 implements MigrationInterface {
  name = 'IncidentResolution1789826300000';

  /**
   * Thêm kết quả xử lý, người đóng, thời điểm đóng cho sự cố; bỏ trạng thái IN_REVIEW; mỗi ảnh gắn cho tối đa một sự cố
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "incidents" SET "status" = 'OPEN' WHERE "status" = 'IN_REVIEW'`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD "resolution" text, ADD "resolved_by" uuid, ADD "resolved_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_fk" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "incidents_horse_created_idx" ON "incidents" ("horse_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "incidents_status_created_idx" ON "incidents" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "incidents_media_asset_uq" ON "incidents" ("media_asset_id") WHERE media_asset_id IS NOT NULL`,
    );
  }

  /**
   * Bỏ kết quả xử lý, người đóng, thời điểm đóng và các index của sự cố
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "incidents_media_asset_uq"`);
    await queryRunner.query(`DROP INDEX "incidents_status_created_idx"`);
    await queryRunner.query(`DROP INDEX "incidents_horse_created_idx"`);
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "incidents_resolved_by_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP COLUMN "resolved_at", DROP COLUMN "resolved_by", DROP COLUMN "resolution"`,
    );
  }
}

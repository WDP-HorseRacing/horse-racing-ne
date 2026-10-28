import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPerformanceThresholds1789828000000 implements MigrationInterface {
  name = 'DropPerformanceThresholds1789828000000';

  /**
   * Xóa bảng ngưỡng riêng của từng ngựa
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "performance_thresholds"`);
  }

  /**
   * Tạo lại bảng ngưỡng riêng của từng ngựa, không có dữ liệu
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "performance_thresholds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid, "profile_name" character varying(100) NOT NULL, "rule_version" integer NOT NULL, "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL, "effective_to" TIMESTAMP WITH TIME ZONE, "limits" jsonb NOT NULL, CONSTRAINT "PK_dc9d0f131457890727a1dd17d76" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_thresholds" ADD CONSTRAINT "FK_fd66a4ec9f879be815eff5f77f2" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}

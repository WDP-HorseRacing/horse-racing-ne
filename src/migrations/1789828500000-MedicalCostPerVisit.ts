import { MigrationInterface, QueryRunner } from 'typeorm';

export class MedicalCostPerVisit1789828500000 implements MigrationInterface {
  name = 'MedicalCostPerVisit1789828500000';

  /**
   * Chuyển chi phí y tế từ bệnh án xuống từng buổi khám
   *
   * - Thêm cột cost (VND, mặc định 0) vào buổi khám
   * - Chi phí của mỗi bệnh án đã đóng chuyển sang buổi khám chưa hủy cuối cùng của bệnh án đó
   * - Bỏ cột total_cost của bệnh án
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và chuyển dữ liệu
   * @throws Error Nếu có bệnh án đã đóng mang chi phí mà không còn buổi khám chưa hủy
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    const [orphan] = (await queryRunner.query(
      `SELECT count(*)::int AS "count"
         FROM "medical_cases" c
        WHERE c."status" = 'CLOSED'
          AND COALESCE(c."total_cost", 0) > 0
          AND NOT EXISTS (SELECT 1 FROM "medical_records" r
                           WHERE r."case_id" = c."id" AND r."voided_at" IS NULL)`,
    )) as Array<{ count: number }>;
    if (orphan.count > 0) {
      throw new Error(
        `${orphan.count} bệnh án đã đóng có chi phí nhưng không còn buổi khám chưa hủy`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "cost" bigint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_cost_chk" CHECK ("cost" >= 0)`,
    );
    await queryRunner.query(
      `UPDATE "medical_records" r
          SET "cost" = c."total_cost"
         FROM "medical_cases" c
        WHERE c."status" = 'CLOSED'
          AND c."total_cost" IS NOT NULL
          AND r."id" = (SELECT l."id" FROM "medical_records" l
                         WHERE l."case_id" = c."id" AND l."voided_at" IS NULL
                         ORDER BY l."exam_date" DESC, l."created_at" DESC, l."id" DESC
                         LIMIT 1)`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" DROP CONSTRAINT "medical_cases_total_cost_chk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" DROP COLUMN "total_cost"`,
    );
  }

  /**
   * Đưa chi phí về lại bệnh án
   *
   * - Bệnh án đã đóng nhận tổng chi phí các buổi khám chưa hủy của nó
   * - Chi phí của buổi khám ngoài bệnh án bị bỏ
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và chuyển dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_cases" ADD "total_cost" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" ADD CONSTRAINT "medical_cases_total_cost_chk" CHECK ("total_cost" >= 0)`,
    );
    await queryRunner.query(
      `UPDATE "medical_cases" c
          SET "total_cost" = (SELECT COALESCE(SUM(r."cost"), 0) FROM "medical_records" r
                               WHERE r."case_id" = c."id" AND r."voided_at" IS NULL)
        WHERE c."status" = 'CLOSED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP CONSTRAINT "medical_records_cost_chk"`,
    );
    await queryRunner.query(`ALTER TABLE "medical_records" DROP COLUMN "cost"`);
  }
}

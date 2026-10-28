import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingSessionIntensity1789824500000 implements MigrationInterface {
  name = 'TrainingSessionIntensity1789824500000';

  /**
   * Bắt buộc mọi buổi tập có cường độ
   *
   * - Dòng để trống hoặc mang giá trị ngoài LIGHT/MODERATE/HEAVY được điền MODERATE
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã điền dữ liệu và đặt NOT NULL
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "training_sessions" SET "intensity" = 'MODERATE'
       WHERE "intensity" IS NULL OR "intensity" NOT IN ('LIGHT', 'MODERATE', 'HEAVY')`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "intensity" SET NOT NULL`,
    );
  }

  /**
   * Cho phép cường độ để trống như trước, giữ nguyên dữ liệu đã điền
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã bỏ NOT NULL
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "intensity" DROP NOT NULL`,
    );
  }
}

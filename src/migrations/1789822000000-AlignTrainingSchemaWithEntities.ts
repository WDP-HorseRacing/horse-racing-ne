import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Các bảng training có cột version đang mang default 1 mà entity không khai.
 */
const VERSION_DEFAULT_TABLES = [
  'horse_enrollments',
  'session_participants',
  'training_classes',
  'trial_results',
];

export class AlignTrainingSchemaWithEntities1789822000000 implements MigrationInterface {
  name = 'AlignTrainingSchemaWithEntities1789822000000';

  /**
   * Cho schema các bảng training khớp entity, giữ nguyên cột legacy và dữ liệu
   *
   * - Bỏ default của cột version
   * - Thêm ràng buộc UNIQUE(session_id) cho time_trials
   * - Đặt default trạng thái buổi tập là DRAFT
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns A promise resolving khi đã đổi xong
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of VERSION_DEFAULT_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "version" DROP DEFAULT`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "time_trials" ADD CONSTRAINT "UQ_200aaf44157db869b56448527d9" UNIQUE ("session_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
  }

  /**
   * Trả schema về như trước khi chạy up
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns A promise resolving khi đã đổi xong
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_trials" DROP CONSTRAINT "UQ_200aaf44157db869b56448527d9"`,
    );
    for (const table of VERSION_DEFAULT_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "version" SET DEFAULT 1`,
      );
    }
  }
}

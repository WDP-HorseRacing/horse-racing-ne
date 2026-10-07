import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingSessionPlannedDistance1789824600000 implements MigrationInterface {
  name = 'TrainingSessionPlannedDistance1789824600000';

  /**
   * Thêm cự ly dự kiến (mét) bắt buộc cho buổi tập
   *
   * - Buổi tập đã có được điền 0
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã thêm cột
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "planned_distance_m" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "planned_distance_m" DROP DEFAULT`,
    );
  }

  /**
   * Bỏ cột cự ly dự kiến
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã bỏ cột
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "planned_distance_m"`,
    );
  }
}

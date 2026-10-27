import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingTwoIntensities1789827200000 implements MigrationInterface {
  name = 'TrainingTwoIntensities1789827200000';

  /**
   * Gộp cường độ Trung bình vào Nặng ở môn học và buổi tập
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "training_subjects" SET "intensity" = 'HEAVY' WHERE "intensity" = 'MODERATE'`,
    );
    await queryRunner.query(
      `UPDATE "training_sessions" SET "intensity" = 'HEAVY' WHERE "intensity" = 'MODERATE'`,
    );
  }

  /**
   * Không tách lại được: không còn biết dòng Nặng nào trước đây là Trung bình
   *
   * @returns Promise hoàn tất ngay, không đổi dữ liệu
   */
  public async down(): Promise<void> {
    return Promise.resolve();
  }
}

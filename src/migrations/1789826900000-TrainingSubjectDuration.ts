import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingSubjectDuration1789826900000 implements MigrationInterface {
  name = 'TrainingSubjectDuration1789826900000';

  /**
   * Thêm thời lượng một buổi (phút) cho môn học
   *
   * - Môn đã có nhận 60 phút
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_subjects" ADD "duration_minutes" integer NOT NULL DEFAULT 60`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_subjects" ADD CONSTRAINT "training_subjects_duration_minutes_ck" CHECK ("duration_minutes" BETWEEN 15 AND 480)`,
    );
  }

  /**
   * Bỏ thời lượng của môn học
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_subjects" DROP CONSTRAINT "training_subjects_duration_minutes_ck"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_subjects" DROP COLUMN "duration_minutes"`,
    );
  }
}

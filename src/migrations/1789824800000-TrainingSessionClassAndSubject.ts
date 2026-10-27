import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingSessionClassAndSubject1789824800000 implements MigrationInterface {
  name = 'TrainingSessionClassAndSubject1789824800000';

  /**
   * Gắn buổi tập thẳng vào lớp và thêm môn học của buổi
   *
   * - class_id lấy từ lớp của giáo án hiện tại của buổi, rồi đặt NOT NULL
   * - subject_id để trống cho buổi đã có
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã thêm cột, khóa ngoại và index
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "class_id" uuid`,
    );
    await queryRunner.query(
      `UPDATE "training_sessions" s SET "class_id" = p."class_id" FROM "training_plans" p WHERE p."id" = s."plan_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "class_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD CONSTRAINT "FK_training_sessions_class" FOREIGN KEY ("class_id") REFERENCES "training_classes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "training_sessions_class_start_idx" ON "training_sessions" ("class_id", "scheduled_start_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "subject_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD CONSTRAINT "FK_training_sessions_subject" FOREIGN KEY ("subject_id") REFERENCES "training_subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  /**
   * Bỏ lớp và môn học khỏi buổi tập
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã bỏ cột
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP CONSTRAINT "FK_training_sessions_subject"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "subject_id"`,
    );
    await queryRunner.query(`DROP INDEX "training_sessions_class_start_idx"`);
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP CONSTRAINT "FK_training_sessions_class"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "class_id"`,
    );
  }
}

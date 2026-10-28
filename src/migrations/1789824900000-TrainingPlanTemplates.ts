import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingPlanTemplates1789824900000 implements MigrationInterface {
  name = 'TrainingPlanTemplates1789824900000';

  /**
   * Đổi giáo án thành mẫu của Head Trainer ghép môn học theo tuần, lớp trỏ tới một giáo án
   *
   * - Xóa toàn bộ dữ liệu huấn luyện cũ (lớp, ghi danh, giáo án, buổi, lượt, chạy thử, đánh giá)
   * - Buổi tập bỏ plan_id, chỉ thuộc lớp
   * - Bảng training_plans dựng lại; thêm training_plan_subjects; training_classes thêm plan_id
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi xong cấu trúc
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'performance_evaluations',
      'trial_results',
      'time_trials',
      'session_participants',
      'training_sessions',
      'horse_enrollments',
    ]) {
      await queryRunner.query(`DELETE FROM "${table}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "plan_id"`,
    );
    await queryRunner.query(`DROP TABLE "training_plans"`);
    await queryRunner.query(`DELETE FROM "training_classes"`);

    await queryRunner.query(
      `CREATE TABLE "training_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "name" character varying(160) NOT NULL, "description" text, "head_trainer_id" uuid NOT NULL, CONSTRAINT "PK_training_plans" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" ADD CONSTRAINT "FK_training_plans_head_trainer" FOREIGN KEY ("head_trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "training_plan_subjects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "plan_id" uuid NOT NULL, "position" integer NOT NULL, "subject_id" uuid NOT NULL, "weeks" integer NOT NULL, CONSTRAINT "PK_training_plan_subjects" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_plan_subjects_position_uq" ON "training_plan_subjects" ("plan_id", "position")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD CONSTRAINT "FK_training_plan_subjects_plan" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD CONSTRAINT "FK_training_plan_subjects_subject" FOREIGN KEY ("subject_id") REFERENCES "training_subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_classes" ADD "plan_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_classes" ADD CONSTRAINT "FK_training_classes_plan" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  /**
   * Không hỗ trợ quay lại: cấu trúc giáo án cũ gắn với lớp đã bị xóa cùng dữ liệu
   *
   * @returns Promise không bao giờ hoàn tất
   * @throws Error Luôn ném lỗi
   */
  public down(): Promise<void> {
    return Promise.reject(new Error('TrainingPlanTemplates không hỗ trợ down'));
  }
}

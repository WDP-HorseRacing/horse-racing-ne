import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingPlanPhases1789825000000 implements MigrationInterface {
  name = 'TrainingPlanPhases1789825000000';

  /**
   * Chia giáo án thành các giai đoạn, mỗi giai đoạn có số tuần và nhiều môn học theo thứ trong tuần
   *
   * - Xóa toàn bộ dữ liệu huấn luyện cũ (lớp, ghi danh, giáo án, buổi, lượt, chạy thử, đánh giá); giữ danh mục môn học
   * - Thêm bảng training_plan_phases thuộc training_plans
   * - Bảng training_plan_subjects dựng lại: thuộc một giai đoạn, có các thứ trong tuần (weekdays)
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
      'training_classes',
      'training_plan_subjects',
      'training_plans',
    ]) {
      await queryRunner.query(`DELETE FROM "${table}"`);
    }
    await queryRunner.query(`DROP TABLE "training_plan_subjects"`);

    await queryRunner.query(
      `CREATE TABLE "training_plan_phases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "plan_id" uuid NOT NULL, "position" integer NOT NULL, "weeks" integer NOT NULL, CONSTRAINT "PK_training_plan_phases" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_plan_phases_position_uq" ON "training_plan_phases" ("plan_id", "position")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_phases" ADD CONSTRAINT "FK_training_plan_phases_plan" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "training_plan_subjects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "phase_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "weekdays" smallint array NOT NULL, CONSTRAINT "training_plan_subjects_weekdays_ck" CHECK (cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]), CONSTRAINT "PK_training_plan_subjects" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_plan_subjects_phase_subject_uq" ON "training_plan_subjects" ("phase_id", "subject_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD CONSTRAINT "FK_training_plan_subjects_phase" FOREIGN KEY ("phase_id") REFERENCES "training_plan_phases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD CONSTRAINT "FK_training_plan_subjects_subject" FOREIGN KEY ("subject_id") REFERENCES "training_subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  /**
   * Không hỗ trợ quay lại: giáo án theo môn và số tuần đã bị xóa cùng dữ liệu
   *
   * @returns Promise không bao giờ hoàn tất
   * @throws Error Luôn ném lỗi
   */
  public down(): Promise<void> {
    return Promise.reject(new Error('TrainingPlanPhases không hỗ trợ down'));
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingPlanMinSessions1789827000000 implements MigrationInterface {
  name = 'TrainingPlanMinSessions1789827000000';

  /**
   * Đổi thứ trong tuần của môn trong giáo án thành số buổi tối thiểu mỗi tuần, và cho lớp giữ bản chép giáo án riêng
   *
   * - Số buổi tối thiểu mỗi tuần của dòng cũ bằng số thứ đã chọn
   * - Thêm bảng training_class_phases, training_class_phase_subjects
   * - Lớp đã có nhận bản chép các giai đoạn và môn của giáo án đang gắn
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và chép dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD "min_sessions_per_week" smallint`,
    );
    await queryRunner.query(
      `UPDATE "training_plan_subjects" SET "min_sessions_per_week" = cardinality("weekdays")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ALTER COLUMN "min_sessions_per_week" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" DROP CONSTRAINT "training_plan_subjects_weekdays_ck"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" DROP COLUMN "weekdays"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD CONSTRAINT "training_plan_subjects_min_sessions_ck" CHECK ("min_sessions_per_week" BETWEEN 1 AND 14)`,
    );

    await queryRunner.query(
      `CREATE TABLE "training_class_phases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "class_id" uuid NOT NULL, "position" integer NOT NULL, "weeks" integer NOT NULL, CONSTRAINT "PK_training_class_phases" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_class_phases_position_uq" ON "training_class_phases" ("class_id", "position")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_class_phases" ADD CONSTRAINT "FK_training_class_phases_class" FOREIGN KEY ("class_id") REFERENCES "training_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "training_class_phase_subjects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "phase_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "min_sessions_per_week" smallint NOT NULL, CONSTRAINT "training_class_phase_subjects_min_sessions_ck" CHECK ("min_sessions_per_week" BETWEEN 1 AND 14), CONSTRAINT "PK_training_class_phase_subjects" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_class_phase_subjects_phase_subject_uq" ON "training_class_phase_subjects" ("phase_id", "subject_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_class_phase_subjects" ADD CONSTRAINT "FK_training_class_phase_subjects_phase" FOREIGN KEY ("phase_id") REFERENCES "training_class_phases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_class_phase_subjects" ADD CONSTRAINT "FK_training_class_phase_subjects_subject" FOREIGN KEY ("subject_id") REFERENCES "training_subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `INSERT INTO "training_class_phases" ("class_id", "position", "weeks")
       SELECT c."id", p."position", p."weeks"
         FROM "training_classes" c
         JOIN "training_plan_phases" p ON p."plan_id" = c."plan_id"`,
    );
    await queryRunner.query(
      `INSERT INTO "training_class_phase_subjects" ("phase_id", "subject_id", "min_sessions_per_week")
       SELECT cp."id", ps."subject_id", ps."min_sessions_per_week"
         FROM "training_class_phases" cp
         JOIN "training_classes" c ON c."id" = cp."class_id"
         JOIN "training_plan_phases" p ON p."plan_id" = c."plan_id" AND p."position" = cp."position"
         JOIN "training_plan_subjects" ps ON ps."phase_id" = p."id"`,
    );
  }

  /**
   * Bỏ bản chép giáo án của lớp và trả lại thứ trong tuần cho môn trong giáo án
   *
   * - Thứ trong tuần dựng lại là các thứ đầu tuần, số thứ bằng số buổi tối thiểu (tối đa 7)
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "training_class_phase_subjects"`);
    await queryRunner.query(`DROP TABLE "training_class_phases"`);
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" DROP CONSTRAINT "training_plan_subjects_min_sessions_ck"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD "weekdays" smallint array`,
    );
    await queryRunner.query(
      `UPDATE "training_plan_subjects" SET "weekdays" = ARRAY(SELECT generate_series(1, LEAST("min_sessions_per_week", 7)))::smallint[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ALTER COLUMN "weekdays" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" ADD CONSTRAINT "training_plan_subjects_weekdays_ck" CHECK (cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plan_subjects" DROP COLUMN "min_sessions_per_week"`,
    );
  }
}

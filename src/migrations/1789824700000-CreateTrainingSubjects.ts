import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTrainingSubjects1789824700000 implements MigrationInterface {
  name = 'CreateTrainingSubjects1789824700000';

  /**
   * Tạo bảng môn học
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã tạo bảng
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "training_subjects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "name" character varying(160) NOT NULL, "description" text, "session_type" character varying(32) NOT NULL, "intensity" character varying(32) NOT NULL, "planned_distance_m" integer NOT NULL, "surface" character varying(80), "target_time_ms" integer, CONSTRAINT "PK_training_subjects" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_subjects_name_uq" ON "training_subjects" ("name")`,
    );
  }

  /**
   * Xóa bảng môn học
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã xóa bảng
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "training_subjects"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExamRequestSourceRef1789824100000 implements MigrationInterface {
  name = 'ExamRequestSourceRef1789824100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" ADD "source_ref_id" uuid`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "medical_exam_requests_source_ref_uq" ON "medical_exam_requests" ("source", "source_ref_id", "alert_type") WHERE source_ref_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."medical_exam_requests_source_ref_uq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" DROP COLUMN "source_ref_id"`,
    );
  }
}

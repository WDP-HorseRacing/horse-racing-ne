import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExamRequestMeasurementId1789824100000 implements MigrationInterface {
  name = 'ExamRequestMeasurementId1789824100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" ADD "measurement_id" uuid`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "medical_exam_requests_measurement_alert_uq" ON "medical_exam_requests" ("measurement_id", "alert_type") WHERE measurement_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."medical_exam_requests_measurement_alert_uq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" DROP COLUMN "measurement_id"`,
    );
  }
}

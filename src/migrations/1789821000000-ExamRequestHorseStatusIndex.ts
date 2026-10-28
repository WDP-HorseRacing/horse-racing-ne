import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExamRequestHorseStatusIndex1789821000000 implements MigrationInterface {
  name = 'ExamRequestHorseStatusIndex1789821000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "medical_exam_requests_horse_status_idx" ON "medical_exam_requests" ("horse_id", "status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."medical_exam_requests_horse_status_idx"`,
    );
  }
}

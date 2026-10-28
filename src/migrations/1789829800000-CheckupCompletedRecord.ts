import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckupCompletedRecord1789829800000 implements MigrationInterface {
  name = 'CheckupCompletedRecord1789829800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD "completed_record_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "care_schedules_completed_record_fk" FOREIGN KEY ("completed_record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "care_schedules_completed_record_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP COLUMN "completed_record_id"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class MedicalRecordHealthBefore1789828900000 implements MigrationInterface {
  name = 'MedicalRecordHealthBefore1789828900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "health_before" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "health_before"`,
    );
  }
}

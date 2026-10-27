import { MigrationInterface, QueryRunner } from 'typeorm';

export class MedicalRecordVersion1789829200000 implements MigrationInterface {
  name = 'MedicalRecordVersion1789829200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "version" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "updated_at"`,
    );
  }
}

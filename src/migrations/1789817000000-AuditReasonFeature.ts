import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditReasonFeature1789817000000 implements MigrationInterface {
  name = 'AuditReasonFeature1789817000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD "reason" text`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "feature" character varying(16)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "feature"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "reason"`);
  }
}

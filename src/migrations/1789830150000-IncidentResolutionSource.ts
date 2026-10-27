import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncidentResolutionSource1789830150000 implements MigrationInterface {
  name = 'IncidentResolutionSource1789830150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD "resolution_source" character varying(16)`,
    );
    await queryRunner.query(
      `UPDATE "incidents"
          SET "resolution_source" = CASE WHEN "resolved_by" IS NULL THEN 'LIFECYCLE' ELSE 'HEAD_TRAINER' END
        WHERE "status" = 'RESOLVED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolution_source_ck" CHECK (("status" = 'OPEN') = ("resolution_source" IS NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "incidents_resolution_source_ck"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP COLUMN "resolution_source"`,
    );
  }
}

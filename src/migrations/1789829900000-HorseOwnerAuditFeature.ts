import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorseOwnerAuditFeature1789829900000 implements MigrationInterface {
  name = 'HorseOwnerAuditFeature1789829900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "audit_logs" SET "feature" = 'HORSE_OWNER'
        WHERE "entity_type" = 'HORSE' AND "feature" = 'HORSE_UPDATE'
          AND "reason" IS NOT NULL
          AND "after_data" ? 'ownerId' AND "after_data" - 'ownerId' = '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "audit_logs" SET "feature" = 'HORSE_UPDATE' WHERE "feature" = 'HORSE_OWNER'`,
    );
  }
}

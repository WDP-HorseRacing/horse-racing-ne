import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditEntityIndex1789820000000 implements MigrationInterface {
  name = 'AuditEntityIndex1789820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."audit_logs_entity_idx"`);
  }
}

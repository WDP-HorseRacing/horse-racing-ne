import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyChecklistItemEvidence1794154952000
  implements MigrationInterface
{
  name = 'DailyChecklistItemEvidence1794154952000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_checklist_items" ADD "evidence_media_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklist_items" ADD CONSTRAINT "daily_checklist_items_evidence_media_fk" FOREIGN KEY ("evidence_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "daily_checklist_items_evidence_media_uq" ON "daily_checklist_items" ("evidence_media_id") WHERE evidence_media_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."daily_checklist_items_evidence_media_uq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklist_items" DROP CONSTRAINT "daily_checklist_items_evidence_media_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklist_items" DROP COLUMN "evidence_media_id"`,
    );
  }
}

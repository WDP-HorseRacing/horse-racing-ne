import { MigrationInterface, QueryRunner } from 'typeorm';

export class MedicalRecordBarnAtExam1789829500000 implements MigrationInterface {
  name = 'MedicalRecordBarnAtExam1789829500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "medical_records" ADD "barn_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_barn_fk" FOREIGN KEY ("barn_id") REFERENCES "barns"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `WITH at_exam AS (
         SELECT r."id",
                CASE
                  WHEN prior."found" THEN prior."barn_id"
                  WHEN later."found" THEN later."barn_id"
                  ELSE h."barn_id"
                END AS "barn_id"
           FROM "medical_records" r
           JOIN "horses" h ON h."id" = r."horse_id"
           LEFT JOIN LATERAL (
                SELECT true AS "found", (a."after_data"->>'barnId')::uuid AS "barn_id"
                  FROM "audit_logs" a
                 WHERE a."entity_type" = 'HORSE'
                   AND a."entity_id" = r."horse_id"
                   AND a."after_data" ? 'barnId'
                   AND a."created_at" <= r."exam_date"
                 ORDER BY a."created_at" DESC, a."id" DESC
                 LIMIT 1
           ) prior ON true
           LEFT JOIN LATERAL (
                SELECT true AS "found", (a."before_data"->>'barnId')::uuid AS "barn_id"
                  FROM "audit_logs" a
                 WHERE a."entity_type" = 'HORSE'
                   AND a."entity_id" = r."horse_id"
                   AND a."before_data" ? 'barnId'
                   AND a."created_at" > r."exam_date"
                 ORDER BY a."created_at" ASC, a."id" ASC
                 LIMIT 1
           ) later ON true
       )
       UPDATE "medical_records" r
          SET "barn_id" = at_exam."barn_id"
         FROM at_exam
        WHERE at_exam."id" = r."id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP CONSTRAINT "medical_records_barn_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "barn_id"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const voidRowsOfFeature = (from: string, to: string) => `
  WITH voids AS (
    SELECT a.id, a.actor_id, a.created_at, a.reason, r.id AS record_id, r.horse_id
      FROM "audit_logs" a
      JOIN "medical_records" r ON r.id = a.entity_id
     WHERE a.feature = '${from}' AND a.entity_type = 'MEDICAL_RECORD'
       AND a.after_data ? 'voidedAt' AND r.kind <> 'FOLLOW_UP'
  )
  UPDATE "audit_logs" l SET "feature" = '${to}'
    FROM voids v
   WHERE l.feature = '${from}'
     AND (
       l.id = v.id
       OR (
         l.actor_id IS NOT DISTINCT FROM v.actor_id
         AND l.created_at = v.created_at
         AND (
           (
             l.entity_type IN ('HORSE_MEASUREMENT', 'MEDICAL_EXAM_REQUEST')
             AND l.reason = v.reason
             AND l.before_data ->> 'medicalRecordId' = v.record_id::text
           )
           OR (
             l.entity_type = 'HORSE'
             AND l.entity_id = v.horse_id
             AND l.reason = 'Hủy buổi khám: ' || v.reason
           )
         )
       )
     )`;

export class VisitVoidAuditFeature1789830000000 implements MigrationInterface {
  name = 'VisitVoidAuditFeature1789830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(voidRowsOfFeature('MED_CASE_VISIT', 'MED_VISIT'));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(voidRowsOfFeature('MED_VISIT', 'MED_CASE_VISIT'));
  }
}

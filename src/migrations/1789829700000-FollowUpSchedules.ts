import { MigrationInterface, QueryRunner } from 'typeorm';

export class FollowUpSchedules1789829700000 implements MigrationInterface {
  name = 'FollowUpSchedules1789829700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD "case_id" uuid, ADD "record_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "care_schedules_case_fk" FOREIGN KEY ("case_id") REFERENCES "medical_cases"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "care_schedules_record_fk" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "care_schedules_record_uq" ON "care_schedules" ("record_id") WHERE record_id IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "care_schedules_follow_up_ck" CHECK (type <> 'FOLLOW_UP' OR (case_id IS NOT NULL AND record_id IS NOT NULL))`,
    );
    await queryRunner.query(
      `WITH active AS (
         SELECT r.id,
                LEAD(r.exam_date) OVER w AS next_exam,
                LEAD(r.vet_id) OVER w AS next_vet
           FROM medical_records r
          WHERE r.voided_at IS NULL AND r.case_id IS NOT NULL
         WINDOW w AS (PARTITION BY r.case_id ORDER BY r.exam_date, r.created_at)
       )
       INSERT INTO "care_schedules"
              (id, version, horse_id, type, due_at, status, completed_at, completed_by, cancel_reason, case_id, record_id)
       SELECT uuid_generate_v4(), 1, r.horse_id, 'FOLLOW_UP', r.next_visit_at,
              CASE
                WHEN r.voided_at IS NOT NULL THEN 'CANCELLED'
                WHEN a.next_exam IS NOT NULL THEN 'COMPLETED'
                WHEN c.status = 'OPEN' THEN 'SCHEDULED'
                ELSE 'CANCELLED'
              END,
              CASE WHEN r.voided_at IS NULL THEN a.next_exam END,
              CASE WHEN r.voided_at IS NULL THEN a.next_vet END,
              CASE
                WHEN r.voided_at IS NOT NULL THEN 'Buổi khám đặt lịch đã hủy'
                WHEN a.next_exam IS NOT NULL THEN NULL
                WHEN c.status = 'CLOSED' THEN 'Bệnh án đã đóng'
                WHEN c.status = 'CANCELLED' THEN 'Bệnh án đã hủy'
              END,
              r.case_id, r.id
         FROM medical_records r
         JOIN medical_cases c ON c.id = r.case_id
         LEFT JOIN active a ON a.id = r.id
        WHERE r.next_visit_at IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "next_visit_at"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "next_visit_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "medical_records" r
          SET "next_visit_at" = s.due_at
         FROM "care_schedules" s
        WHERE s.record_id = r.id AND s.type = 'FOLLOW_UP'`,
    );
    await queryRunner.query(
      `DELETE FROM "care_schedules" WHERE "type" = 'FOLLOW_UP'`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "care_schedules_follow_up_ck"`,
    );
    await queryRunner.query(`DROP INDEX "public"."care_schedules_record_uq"`);
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "care_schedules_record_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "care_schedules_case_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP COLUMN "record_id", DROP COLUMN "case_id"`,
    );
  }
}

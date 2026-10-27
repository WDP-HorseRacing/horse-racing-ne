import { MigrationInterface, QueryRunner } from 'typeorm';

export class Flow3Medical1789819000000 implements MigrationInterface {
  name = 'Flow3Medical1789819000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "medical_cases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "opened_at" TIMESTAMP WITH TIME ZONE NOT NULL, "opened_by" uuid NOT NULL, "initial_diagnosis" text NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'OPEN', "closed_at" TIMESTAMP WITH TIME ZONE, "closed_by" uuid, "final_conclusion" text, "total_cost" bigint, CONSTRAINT "medical_cases_total_cost_chk" CHECK ("total_cost" >= 0), CONSTRAINT "PK_adfe13b67095eba727547755e51" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "medical_cases_open_horse_uq" ON "medical_cases" ("horse_id") WHERE status = 'OPEN'`,
    );
    await queryRunner.query(
      `CREATE TABLE "medical_exam_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "requested_by" uuid, "source" character varying(24) NOT NULL, "urgent" boolean NOT NULL DEFAULT false, "description" text NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'PENDING', "dismiss_reason" text, "handled_by" uuid, "handled_at" TIMESTAMP WITH TIME ZONE, "medical_record_id" uuid, "incident_id" uuid, "alert_type" character varying(16), CONSTRAINT "PK_39c35752b7f5cc3b9b1f83ef73c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "medical_exam_requests_pending_alert_uq" ON "medical_exam_requests" ("horse_id", "alert_type") WHERE status = 'PENDING' AND alert_type IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "training_locks" ADD "case_id" uuid`);
    await queryRunner.query(`ALTER TABLE "medical_records" ADD "case_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "kind" character varying(16) NOT NULL DEFAULT 'ROUTINE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ALTER COLUMN "kind" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "conclusion" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "next_visit_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD "care_instructions" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD "completed_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD "cancel_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ALTER COLUMN "diagnosis" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ALTER COLUMN "severity" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "medical_records_case_idx" ON "medical_records" ("case_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "medical_records_horse_exam_idx" ON "medical_records" ("horse_id", "exam_date") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "care_schedules_active_checkup_uq" ON "care_schedules" ("horse_id") WHERE type = 'ROUTINE_CHECKUP' AND status = 'SCHEDULED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" ADD CONSTRAINT "FK_685577283d07cb4b63b7d7de836" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" ADD CONSTRAINT "FK_3fb70724e37c597a009eb8a435b" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" ADD CONSTRAINT "FK_24deaea93af143bfee25d696195" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" ADD CONSTRAINT "FK_0bba949bb4bda9ec453e9a51e87" FOREIGN KEY ("case_id") REFERENCES "medical_cases"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD CONSTRAINT "FK_ee0f29feaad17f434c110823939" FOREIGN KEY ("case_id") REFERENCES "medical_cases"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" ADD CONSTRAINT "FK_36c1e4d555e4469a511108cfed9" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" ADD CONSTRAINT "FK_bfa00ccffa73e663db562c05bc7" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" ADD CONSTRAINT "FK_1472b74042baa643088b98dd4b3" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" ADD CONSTRAINT "FK_a98a807d1110c31931725179b56" FOREIGN KEY ("medical_record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" ADD CONSTRAINT "FK_dba1dddd0849b88e8c0e1786358" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "FK_7201d9b182111a6f01e43ce02b6" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "FK_7201d9b182111a6f01e43ce02b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" DROP CONSTRAINT "FK_dba1dddd0849b88e8c0e1786358"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" DROP CONSTRAINT "FK_a98a807d1110c31931725179b56"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" DROP CONSTRAINT "FK_1472b74042baa643088b98dd4b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" DROP CONSTRAINT "FK_bfa00ccffa73e663db562c05bc7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_exam_requests" DROP CONSTRAINT "FK_36c1e4d555e4469a511108cfed9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP CONSTRAINT "FK_ee0f29feaad17f434c110823939"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" DROP CONSTRAINT "FK_0bba949bb4bda9ec453e9a51e87"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" DROP CONSTRAINT "FK_24deaea93af143bfee25d696195"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" DROP CONSTRAINT "FK_3fb70724e37c597a009eb8a435b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_cases" DROP CONSTRAINT "FK_685577283d07cb4b63b7d7de836"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."care_schedules_active_checkup_uq"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."medical_records_horse_exam_idx"`,
    );
    await queryRunner.query(`DROP INDEX "public"."medical_records_case_idx"`);
    await queryRunner.query(
      `UPDATE "medical_records" SET "severity" = 'LOW' WHERE "severity" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ALTER COLUMN "severity" SET NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "medical_records" SET "diagnosis" = '' WHERE "diagnosis" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ALTER COLUMN "diagnosis" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP COLUMN "cancel_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP COLUMN "completed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "care_instructions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "next_visit_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "conclusion"`,
    );
    await queryRunner.query(`ALTER TABLE "medical_records" DROP COLUMN "kind"`);
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP COLUMN "case_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" DROP COLUMN "case_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."medical_exam_requests_pending_alert_uq"`,
    );
    await queryRunner.query(`DROP TABLE "medical_exam_requests"`);
    await queryRunner.query(
      `DROP INDEX "public"."medical_cases_open_horse_uq"`,
    );
    await queryRunner.query(`DROP TABLE "medical_cases"`);
  }
}

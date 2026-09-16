import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefineTrainingFlowAndIndexes1789560000000 implements MigrationInterface {
  name = 'RefineTrainingFlowAndIndexes1789560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const speculativeIndexes = [
      'horses_club_status_idx',
      'horse_ownerships_horse_active_idx',
      'horse_ownerships_owner_active_idx',
      'training_plans_horse_dates_idx',
      'training_sessions_plan_schedule_idx',
      'training_sessions_groom_schedule_idx',
      'time_trials_session_idx',
      'performance_metrics_session_time_idx',
      'performance_thresholds_effective_idx',
      'medical_records_horse_exam_idx',
      'prescriptions_medical_record_idx',
      'injury_markers_medical_record_idx',
      'injury_markers_case_created_idx',
      'care_schedules_horse_due_idx',
      'feeding_plans_horse_effective_idx',
      'incidents_horse_created_idx',
      'races_club_schedule_idx',
      'supply_requests_item_status_idx',
      'notifications_recipient_read_created_idx',
      'audit_logs_club_created_idx',
      'audit_logs_entity_idx',
    ];
    for (const index of speculativeIndexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
    }

    await queryRunner.query(
      `ALTER TABLE "training_plans" ADD "activated_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" ADD "completed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" ADD "cancelled_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" ADD "cancel_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "planned_duration_minutes" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "actual_distance_km" numeric(8,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "actual_duration_seconds" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "perceived_effort" smallint`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "completion_notes" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "cancelled_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "cancelled_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "cancel_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD CONSTRAINT "FK_training_sessions_cancelled_by" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP CONSTRAINT "FK_training_sessions_cancelled_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "cancel_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "cancelled_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "cancelled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "completion_notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "perceived_effort"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "actual_duration_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "actual_distance_km"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "planned_duration_minutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" DROP COLUMN "cancel_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" DROP COLUMN "cancelled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" DROP COLUMN "completed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" DROP COLUMN "activated_at"`,
    );

    await queryRunner.query(
      `CREATE INDEX "horses_club_status_idx" ON "horses" ("club_id", "lifecycle_status", "health_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_ownerships_horse_active_idx" ON "horse_ownerships" ("horse_id", "end_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_ownerships_owner_active_idx" ON "horse_ownerships" ("owner_id", "end_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "training_plans_horse_dates_idx" ON "training_plans" ("horse_id", "start_date", "end_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "training_sessions_plan_schedule_idx" ON "training_sessions" ("plan_id", "scheduled_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "training_sessions_groom_schedule_idx" ON "training_sessions" ("groom_id", "scheduled_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "time_trials_session_idx" ON "time_trials" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "performance_metrics_session_time_idx" ON "performance_metrics" ("session_id", "recorded_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "performance_thresholds_effective_idx" ON "performance_thresholds" ("club_id", "horse_id", "effective_from")`,
    );
    await queryRunner.query(
      `CREATE INDEX "medical_records_horse_exam_idx" ON "medical_records" ("horse_id", "exam_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "prescriptions_medical_record_idx" ON "prescriptions" ("medical_record_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "injury_markers_medical_record_idx" ON "injury_markers" ("medical_record_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "injury_markers_case_created_idx" ON "injury_markers" ("injury_case_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "care_schedules_horse_due_idx" ON "care_schedules" ("horse_id", "due_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "feeding_plans_horse_effective_idx" ON "feeding_plans" ("horse_id", "effective_from")`,
    );
    await queryRunner.query(
      `CREATE INDEX "incidents_horse_created_idx" ON "incidents" ("horse_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "races_club_schedule_idx" ON "races" ("club_id", "scheduled_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "supply_requests_item_status_idx" ON "supply_requests" ("item_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "notifications_recipient_read_created_idx" ON "notifications" ("recipient_id", "read_at", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "audit_logs_club_created_idx" ON "audit_logs" ("club_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id", "created_at")`,
    );
  }
}

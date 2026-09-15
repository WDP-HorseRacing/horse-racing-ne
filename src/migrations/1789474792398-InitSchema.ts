import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1789474792398 implements MigrationInterface {
  name = 'InitSchema1789474792398';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "clubs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(160) NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_bb09bd0c8d5238aeaa8f86ee0d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "clubs_name_uq" ON "clubs" ("name") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "club_id" uuid, "keycloak_id" uuid NOT NULL, "full_name" character varying(160) NOT NULL, "email" character varying(254) NOT NULL, "password_hash" character varying(255), "role" character varying(32), "status" character varying(32) NOT NULL DEFAULT 'PENDING', CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_keycloak_id_uq" ON "users" ("keycloak_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_pending_email_uq" ON "users" ("email") WHERE club_id IS NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_club_email_uq" ON "users" ("club_id", "email") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "media_assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "club_id" uuid NOT NULL, "uploaded_by" uuid NOT NULL, "storage_provider" character varying(40) NOT NULL, "object_key" character varying(500) NOT NULL, "mime_type" character varying(120) NOT NULL, "byte_size" bigint NOT NULL, CONSTRAINT "PK_ca47e9f67a5e5d8af1e75d66ee6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "media_assets_provider_key_uq" ON "media_assets" ("storage_provider", "object_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "horses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "club_id" uuid NOT NULL, "name" character varying(160) NOT NULL, "date_of_birth" date, "microchip_id" character varying(80), "photo_asset_id" uuid, "sire_id" uuid, "dam_id" uuid, "health_status" character varying(32) NOT NULL DEFAULT 'ELIGIBLE', "lifecycle_status" character varying(32) NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_2f98809688092c22977eb638c30" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "horses_club_status_idx" ON "horses" ("club_id", "lifecycle_status", "health_status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "horses_club_microchip_uq" ON "horses" ("club_id", "microchip_id") WHERE microchip_id IS NOT NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "training_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "created_by" uuid NOT NULL, "phase_name" character varying(160) NOT NULL, "goal" text NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'SCHEDULED', CONSTRAINT "PK_246975cb895b51662b90515a390" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "training_plans_horse_dates_idx" ON "training_plans" ("horse_id", "start_date", "end_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "training_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "plan_id" uuid NOT NULL, "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL, "distance_km" numeric(8,2) NOT NULL, "intensity" character varying(32) NOT NULL, "surface" character varying(80), "groom_id" uuid, "status" character varying(32) NOT NULL DEFAULT 'SCHEDULED', "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6678399f77ed9db5176459befa9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "training_sessions_groom_schedule_idx" ON "training_sessions" ("groom_id", "scheduled_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "training_sessions_plan_schedule_idx" ON "training_sessions" ("plan_id", "scheduled_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "time_trials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "session_id" uuid NOT NULL, "distance_meters" numeric(8,2) NOT NULL, "duration_seconds" numeric(10,3) NOT NULL, "video_asset_id" uuid, "notes" text, CONSTRAINT "PK_46248a8860224b5f6160d346641" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "time_trials_session_idx" ON "time_trials" ("session_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "supply_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "club_id" uuid NOT NULL, "name" character varying(160) NOT NULL, "unit" character varying(32) NOT NULL, "quantity_on_hand" numeric(12,2) NOT NULL DEFAULT '0', "reorder_threshold" numeric(12,2) NOT NULL DEFAULT '0', CONSTRAINT "PK_b2fb72ee1259b3531157e60bdc8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "supply_items_club_name_uq" ON "supply_items" ("club_id", "name") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "supply_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "item_id" uuid NOT NULL, "requested_by" uuid NOT NULL, "quantity" numeric(12,2) NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'PENDING', "note" text, CONSTRAINT "PK_5b35a507f26b602d39ba35e904e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "supply_requests_item_status_idx" ON "supply_requests" ("item_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "stalls" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "club_id" uuid NOT NULL, "code" character varying(80) NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'AVAILABLE', CONSTRAINT "PK_5a4c078028ebefcb8186dedb6db" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "stalls_club_code_uq" ON "stalls" ("club_id", "code") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "stable_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "stall_id" uuid NOT NULL, "groom_id" uuid NOT NULL, "start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_73511ff950a87c455391081ace7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "stable_assignments_active_stall_uq" ON "stable_assignments" ("stall_id") WHERE end_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "stable_assignments_active_horse_uq" ON "stable_assignments" ("horse_id") WHERE end_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "incidents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "reported_by" uuid NOT NULL, "description" text NOT NULL, "urgent" boolean NOT NULL DEFAULT false, "media_asset_id" uuid, "status" character varying(32) NOT NULL DEFAULT 'OPEN', CONSTRAINT "PK_ccb34c01719889017e2246469f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "incidents_horse_created_idx" ON "incidents" ("horse_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "feeding_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, "status" character varying(16) NOT NULL DEFAULT 'DRAFT', "effective_from" date NOT NULL, "effective_to" date, "ration" jsonb NOT NULL, CONSTRAINT "PK_f48bbf59a8870f105229477f431" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "feeding_plans_horse_effective_idx" ON "feeding_plans" ("horse_id", "effective_from") `,
    );
    await queryRunner.query(
      `CREATE TABLE "daily_checklists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "groom_id" uuid NOT NULL, "checklist_date" date NOT NULL, "items" jsonb NOT NULL, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_019b4718918b4fa3a4bcbb1ecf1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "daily_checklists_horse_groom_date_uq" ON "daily_checklists" ("horse_id", "groom_id", "checklist_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "races" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "club_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL, "conditions" jsonb, "status" character varying(32) NOT NULL DEFAULT 'PLANNED', CONSTRAINT "PK_ba7d19b382156bc33244426c597" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "races_club_schedule_idx" ON "races" ("club_id", "scheduled_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "race_registrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "race_id" uuid NOT NULL, "horse_id" uuid NOT NULL, "requested_by" uuid NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'PROPOSED', "owner_approved_at" TIMESTAMP WITH TIME ZONE, "manager_confirmed_at" TIMESTAMP WITH TIME ZONE, "placing" smallint, "time_seconds" numeric(10,3), CONSTRAINT "PK_bbcbb587e1381eb51e0e51bc613" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "race_registrations_race_horse_uq" ON "race_registrations" ("race_id", "horse_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "performance_thresholds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "club_id" uuid NOT NULL, "horse_id" uuid, "profile_name" character varying(100) NOT NULL, "rule_version" integer NOT NULL, "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL, "effective_to" TIMESTAMP WITH TIME ZONE, "limits" jsonb NOT NULL, CONSTRAINT "PK_dc9d0f131457890727a1dd17d76" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "performance_thresholds_effective_idx" ON "performance_thresholds" ("club_id", "horse_id", "effective_from") `,
    );
    await queryRunner.query(
      `CREATE TABLE "performance_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "session_id" uuid NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "source_id" character varying(80) NOT NULL, "heart_rate_bpm" smallint NOT NULL, "speed_mps" numeric(8,3) NOT NULL, "alert_level" character varying(16) NOT NULL DEFAULT 'NORMAL', CONSTRAINT "PK_66237d8c606d64c7bd44a91f74a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "performance_metrics_source_uq" ON "performance_metrics" ("session_id", "recorded_at", "source_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "performance_metrics_session_time_idx" ON "performance_metrics" ("session_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "performance_evaluations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "session_id" uuid NOT NULL, "evaluator_id" uuid NOT NULL, "score" smallint NOT NULL, "comment" text, CONSTRAINT "PK_aa5ff53349b99197cde4194bda1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "performance_evaluations_session_uq" ON "performance_evaluations" ("session_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "recipient_id" uuid NOT NULL, "event_id" uuid, "type" character varying(80) NOT NULL, "title" character varying(200) NOT NULL, "message" text NOT NULL, "priority" character varying(16) NOT NULL DEFAULT 'NORMAL', "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "notifications_event_recipient_uq" ON "notifications" ("event_id", "recipient_id") WHERE event_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "notifications_recipient_read_created_idx" ON "notifications" ("recipient_id", "read_at", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "training_locks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "locked_by" uuid NOT NULL, "reason" text NOT NULL, "lock_start" TIMESTAMP WITH TIME ZONE NOT NULL, "lock_end" TIMESTAMP WITH TIME ZONE, "status" character varying(16) NOT NULL DEFAULT 'ACTIVE', "released_by" uuid, "released_at" TIMESTAMP WITH TIME ZONE, "release_conclusion" text, CONSTRAINT "PK_09e3b287f77588f2f8444dcdf9d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_locks_active_horse_uq" ON "training_locks" ("horse_id") WHERE status = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE TABLE "medical_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "horse_id" uuid NOT NULL, "vet_id" uuid NOT NULL, "exam_date" TIMESTAMP WITH TIME ZONE NOT NULL, "diagnosis" text NOT NULL, "severity" character varying(32) NOT NULL, "resulting_status" character varying(32) NOT NULL, "voided_at" TIMESTAMP WITH TIME ZONE, "void_reason" text, "replaces_record_id" uuid, CONSTRAINT "PK_c200c0b76638124b7ed51424823" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "medical_records_horse_exam_idx" ON "medical_records" ("horse_id", "exam_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "prescriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "medical_record_id" uuid NOT NULL, "medicine" character varying(160) NOT NULL, "dosage" character varying(160) NOT NULL, "frequency" character varying(160) NOT NULL, "start_date" date NOT NULL, "end_date" date, CONSTRAINT "PK_097b2cc2f2b7e56825468188503" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "prescriptions_medical_record_idx" ON "prescriptions" ("medical_record_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "injury_markers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "medical_record_id" uuid NOT NULL, "injury_case_id" uuid NOT NULL, "body_region" character varying(80) NOT NULL, "injury_type" character varying(100) NOT NULL, "recovery_status" character varying(32) NOT NULL, "notes" text, CONSTRAINT "PK_ff7e4f5d27837f5bfec0f81f062" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "injury_markers_medical_record_idx" ON "injury_markers" ("medical_record_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "injury_markers_case_created_idx" ON "injury_markers" ("injury_case_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "care_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "type" character varying(32) NOT NULL, "due_at" TIMESTAMP WITH TIME ZONE NOT NULL, "assigned_to" uuid, "status" character varying(32) NOT NULL DEFAULT 'SCHEDULED', "completed_at" TIMESTAMP WITH TIME ZONE, "notes" text, CONSTRAINT "PK_f987456f50453550cc80e585df6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "care_schedules_horse_due_idx" ON "care_schedules" ("horse_id", "due_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "horse_ownerships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "owner_id" uuid NOT NULL, "percentage" numeric(5,2) NOT NULL, "start_date" date NOT NULL, "end_date" date, CONSTRAINT "PK_be43a225b8cfc55c7c38f8a48d0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_ownerships_owner_active_idx" ON "horse_ownerships" ("owner_id", "end_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_ownerships_horse_active_idx" ON "horse_ownerships" ("horse_id", "end_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "club_id" uuid NOT NULL, "actor_id" uuid, "action" character varying(100) NOT NULL, "entity_type" character varying(100) NOT NULL, "entity_id" uuid NOT NULL, "before_data" jsonb, "after_data" jsonb, "correlation_id" character varying(128), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "audit_logs_club_created_idx" ON "audit_logs" ("club_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_e58379384536c965ebebefb12a3" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "FK_368d27bda8d30c50ce6ea2637ff" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "FK_b8909597cf71b1748f5cc37b675" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD CONSTRAINT "FK_e90498cbd59c796456582353044" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD CONSTRAINT "FK_f4cc17a619b877a1d2252a5eac2" FOREIGN KEY ("photo_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD CONSTRAINT "FK_a7beb874c215ef045fd3b6ea0c4" FOREIGN KEY ("sire_id") REFERENCES "horses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD CONSTRAINT "FK_b2955036c2aac0a18714e2f39b7" FOREIGN KEY ("dam_id") REFERENCES "horses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" ADD CONSTRAINT "FK_f8d78a00b5a5ba90f043044dc9b" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" ADD CONSTRAINT "FK_df65819edcc582cb95d3326e85b" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD CONSTRAINT "FK_ba4765b834f86a89a874f904912" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD CONSTRAINT "FK_d64978ddc49313e0aa9979bca9d" FOREIGN KEY ("groom_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_trials" ADD CONSTRAINT "FK_200aaf44157db869b56448527d9" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_trials" ADD CONSTRAINT "FK_38b16008b226ef05c6c5b200778" FOREIGN KEY ("video_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_items" ADD CONSTRAINT "FK_bf7f77b9209d9f9ff6f7ac672e1" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ADD CONSTRAINT "FK_95faeb4bc149789483337e2127c" FOREIGN KEY ("item_id") REFERENCES "supply_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ADD CONSTRAINT "FK_673bb0543902de40c9f513c4457" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stalls" ADD CONSTRAINT "FK_dddf8f16839fdf333aa8cde4f94" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stable_assignments" ADD CONSTRAINT "FK_2e1e31e5a5bcf7ce9deb7c531c4" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stable_assignments" ADD CONSTRAINT "FK_e294fc913221d65680858d413ea" FOREIGN KEY ("stall_id") REFERENCES "stalls"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stable_assignments" ADD CONSTRAINT "FK_7ec9aa26b735395c7243d584fb1" FOREIGN KEY ("groom_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "FK_75554f02439171b2719f0fb3fb9" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "FK_3ebe443aa45fa27fd71ed165e04" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "FK_98ca5b7d2233f0e9c5a0c89b590" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" ADD CONSTRAINT "FK_886094e9ad8ee424047faa138af" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" ADD CONSTRAINT "FK_c2b75edf5e28607d9e4d037f106" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklists" ADD CONSTRAINT "FK_9ed8687dfcf52711ae7180b7923" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklists" ADD CONSTRAINT "FK_1dcf9d6a6f90d9b394d8adaf2ae" FOREIGN KEY ("groom_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "races" ADD CONSTRAINT "FK_e6da37d32cff6030a3d090a5e5a" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" ADD CONSTRAINT "FK_08fcda226baea0824fb7b2206fb" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" ADD CONSTRAINT "FK_cfb18e4e1529dcc0d18b6deb1e7" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" ADD CONSTRAINT "FK_d861588e8f04aa8fa01bd6ba231" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_thresholds" ADD CONSTRAINT "FK_8a903dbc7172c6b337455ecc4f9" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_thresholds" ADD CONSTRAINT "FK_fd66a4ec9f879be815eff5f77f2" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_metrics" ADD CONSTRAINT "FK_ea4a140e8c2814976d70ed79ffb" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_evaluations" ADD CONSTRAINT "FK_fe45da97f7584f089013c193f36" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_evaluations" ADD CONSTRAINT "FK_84065b96863e44f3d2ee976928c" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_5332a4daa46fd3f4e6625dd275d" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" ADD CONSTRAINT "FK_3cd880050c1936d0f968c4b0cbc" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" ADD CONSTRAINT "FK_911a916825f8a869f4d8ffd5b38" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" ADD CONSTRAINT "FK_dae7f9e136a39e1a4eff3a60642" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD CONSTRAINT "FK_9fa983f6eb3bed3af90b3221d18" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD CONSTRAINT "FK_d70c0c9727af782e845c699aa15" FOREIGN KEY ("vet_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" ADD CONSTRAINT "FK_e4d6d6ba1bd8218069cda0a6ab3" FOREIGN KEY ("replaces_record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" ADD CONSTRAINT "FK_c08f4e7ba1be3af7cf50e4d2eae" FOREIGN KEY ("medical_record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ADD CONSTRAINT "FK_633a2b12750bdaeea53a346c6d9" FOREIGN KEY ("medical_record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "FK_b1abb00c7205c878c8c1ab092f8" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "FK_bb69a3f82bc1bc2dfb4d01cea09" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD CONSTRAINT "FK_3e221b15f14a65f4d32cb42e90a" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD CONSTRAINT "FK_d1e3d66782bccda90ac5112c0ed" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_4285041d0c5357c95fe589c98af" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_177183f29f438c488b5e8510cdb" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_177183f29f438c488b5e8510cdb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_4285041d0c5357c95fe589c98af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" DROP CONSTRAINT "FK_d1e3d66782bccda90ac5112c0ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" DROP CONSTRAINT "FK_3e221b15f14a65f4d32cb42e90a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "FK_bb69a3f82bc1bc2dfb4d01cea09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "FK_b1abb00c7205c878c8c1ab092f8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" DROP CONSTRAINT "FK_633a2b12750bdaeea53a346c6d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP CONSTRAINT "FK_c08f4e7ba1be3af7cf50e4d2eae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP CONSTRAINT "FK_e4d6d6ba1bd8218069cda0a6ab3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP CONSTRAINT "FK_d70c0c9727af782e845c699aa15"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_records" DROP CONSTRAINT "FK_9fa983f6eb3bed3af90b3221d18"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" DROP CONSTRAINT "FK_dae7f9e136a39e1a4eff3a60642"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" DROP CONSTRAINT "FK_911a916825f8a869f4d8ffd5b38"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_locks" DROP CONSTRAINT "FK_3cd880050c1936d0f968c4b0cbc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_5332a4daa46fd3f4e6625dd275d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_evaluations" DROP CONSTRAINT "FK_84065b96863e44f3d2ee976928c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_evaluations" DROP CONSTRAINT "FK_fe45da97f7584f089013c193f36"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_metrics" DROP CONSTRAINT "FK_ea4a140e8c2814976d70ed79ffb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_thresholds" DROP CONSTRAINT "FK_fd66a4ec9f879be815eff5f77f2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_thresholds" DROP CONSTRAINT "FK_8a903dbc7172c6b337455ecc4f9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" DROP CONSTRAINT "FK_d861588e8f04aa8fa01bd6ba231"`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" DROP CONSTRAINT "FK_cfb18e4e1529dcc0d18b6deb1e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" DROP CONSTRAINT "FK_08fcda226baea0824fb7b2206fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "races" DROP CONSTRAINT "FK_e6da37d32cff6030a3d090a5e5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklists" DROP CONSTRAINT "FK_1dcf9d6a6f90d9b394d8adaf2ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_checklists" DROP CONSTRAINT "FK_9ed8687dfcf52711ae7180b7923"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" DROP CONSTRAINT "FK_c2b75edf5e28607d9e4d037f106"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feeding_plans" DROP CONSTRAINT "FK_886094e9ad8ee424047faa138af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "FK_98ca5b7d2233f0e9c5a0c89b590"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "FK_3ebe443aa45fa27fd71ed165e04"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "FK_75554f02439171b2719f0fb3fb9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stable_assignments" DROP CONSTRAINT "FK_7ec9aa26b735395c7243d584fb1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stable_assignments" DROP CONSTRAINT "FK_e294fc913221d65680858d413ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stable_assignments" DROP CONSTRAINT "FK_2e1e31e5a5bcf7ce9deb7c531c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stalls" DROP CONSTRAINT "FK_dddf8f16839fdf333aa8cde4f94"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" DROP CONSTRAINT "FK_673bb0543902de40c9f513c4457"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" DROP CONSTRAINT "FK_95faeb4bc149789483337e2127c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_items" DROP CONSTRAINT "FK_bf7f77b9209d9f9ff6f7ac672e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_trials" DROP CONSTRAINT "FK_38b16008b226ef05c6c5b200778"`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_trials" DROP CONSTRAINT "FK_200aaf44157db869b56448527d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP CONSTRAINT "FK_d64978ddc49313e0aa9979bca9d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP CONSTRAINT "FK_ba4765b834f86a89a874f904912"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" DROP CONSTRAINT "FK_df65819edcc582cb95d3326e85b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_plans" DROP CONSTRAINT "FK_f8d78a00b5a5ba90f043044dc9b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" DROP CONSTRAINT "FK_b2955036c2aac0a18714e2f39b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" DROP CONSTRAINT "FK_a7beb874c215ef045fd3b6ea0c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" DROP CONSTRAINT "FK_f4cc17a619b877a1d2252a5eac2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" DROP CONSTRAINT "FK_e90498cbd59c796456582353044"`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "FK_b8909597cf71b1748f5cc37b675"`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "FK_368d27bda8d30c50ce6ea2637ff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_e58379384536c965ebebefb12a3"`,
    );
    await queryRunner.query(`DROP INDEX "public"."audit_logs_entity_idx"`);
    await queryRunner.query(
      `DROP INDEX "public"."audit_logs_club_created_idx"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."horse_ownerships_horse_active_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."horse_ownerships_owner_active_idx"`,
    );
    await queryRunner.query(`DROP TABLE "horse_ownerships"`);
    await queryRunner.query(
      `DROP INDEX "public"."care_schedules_horse_due_idx"`,
    );
    await queryRunner.query(`DROP TABLE "care_schedules"`);
    await queryRunner.query(
      `DROP INDEX "public"."injury_markers_case_created_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."injury_markers_medical_record_idx"`,
    );
    await queryRunner.query(`DROP TABLE "injury_markers"`);
    await queryRunner.query(
      `DROP INDEX "public"."prescriptions_medical_record_idx"`,
    );
    await queryRunner.query(`DROP TABLE "prescriptions"`);
    await queryRunner.query(
      `DROP INDEX "public"."medical_records_horse_exam_idx"`,
    );
    await queryRunner.query(`DROP TABLE "medical_records"`);
    await queryRunner.query(
      `DROP INDEX "public"."training_locks_active_horse_uq"`,
    );
    await queryRunner.query(`DROP TABLE "training_locks"`);
    await queryRunner.query(
      `DROP INDEX "public"."notifications_recipient_read_created_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."notifications_event_recipient_uq"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(
      `DROP INDEX "public"."performance_evaluations_session_uq"`,
    );
    await queryRunner.query(`DROP TABLE "performance_evaluations"`);
    await queryRunner.query(
      `DROP INDEX "public"."performance_metrics_session_time_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."performance_metrics_source_uq"`,
    );
    await queryRunner.query(`DROP TABLE "performance_metrics"`);
    await queryRunner.query(
      `DROP INDEX "public"."performance_thresholds_effective_idx"`,
    );
    await queryRunner.query(`DROP TABLE "performance_thresholds"`);
    await queryRunner.query(
      `DROP INDEX "public"."race_registrations_race_horse_uq"`,
    );
    await queryRunner.query(`DROP TABLE "race_registrations"`);
    await queryRunner.query(`DROP INDEX "public"."races_club_schedule_idx"`);
    await queryRunner.query(`DROP TABLE "races"`);
    await queryRunner.query(
      `DROP INDEX "public"."daily_checklists_horse_groom_date_uq"`,
    );
    await queryRunner.query(`DROP TABLE "daily_checklists"`);
    await queryRunner.query(
      `DROP INDEX "public"."feeding_plans_horse_effective_idx"`,
    );
    await queryRunner.query(`DROP TABLE "feeding_plans"`);
    await queryRunner.query(
      `DROP INDEX "public"."incidents_horse_created_idx"`,
    );
    await queryRunner.query(`DROP TABLE "incidents"`);
    await queryRunner.query(
      `DROP INDEX "public"."stable_assignments_active_horse_uq"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."stable_assignments_active_stall_uq"`,
    );
    await queryRunner.query(`DROP TABLE "stable_assignments"`);
    await queryRunner.query(`DROP INDEX "public"."stalls_club_code_uq"`);
    await queryRunner.query(`DROP TABLE "stalls"`);
    await queryRunner.query(
      `DROP INDEX "public"."supply_requests_item_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "supply_requests"`);
    await queryRunner.query(`DROP INDEX "public"."supply_items_club_name_uq"`);
    await queryRunner.query(`DROP TABLE "supply_items"`);
    await queryRunner.query(`DROP INDEX "public"."time_trials_session_idx"`);
    await queryRunner.query(`DROP TABLE "time_trials"`);
    await queryRunner.query(
      `DROP INDEX "public"."training_sessions_plan_schedule_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."training_sessions_groom_schedule_idx"`,
    );
    await queryRunner.query(`DROP TABLE "training_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."training_plans_horse_dates_idx"`,
    );
    await queryRunner.query(`DROP TABLE "training_plans"`);
    await queryRunner.query(`DROP INDEX "public"."horses_club_microchip_uq"`);
    await queryRunner.query(`DROP INDEX "public"."horses_club_status_idx"`);
    await queryRunner.query(`DROP TABLE "horses"`);
    await queryRunner.query(
      `DROP INDEX "public"."media_assets_provider_key_uq"`,
    );
    await queryRunner.query(`DROP TABLE "media_assets"`);
    await queryRunner.query(`DROP INDEX "public"."users_club_email_uq"`);
    await queryRunner.query(`DROP INDEX "public"."users_pending_email_uq"`);
    await queryRunner.query(`DROP INDEX "public"."users_keycloak_id_uq"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."clubs_name_uq"`);
    await queryRunner.query(`DROP TABLE "clubs"`);
  }
}

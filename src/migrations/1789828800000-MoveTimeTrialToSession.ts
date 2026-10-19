import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveTimeTrialToSession1789828800000 implements MigrationInterface {
  name = 'MoveTimeTrialToSession1789828800000';

  /**
   * Chuyển cấu hình chạy thử vào buổi tập và bỏ bảng time_trials
   *
   * - Thêm training_sessions.target_time_ms, chép từ time_trials; buổi không phải TIME_TRIAL luôn null (ràng buộc CHECK)
   * - Ghi chú chạy thử gộp vào ghi chú buổi: buổi chưa có ghi chú thì lấy ghi chú chạy thử, có cả hai thì nối bằng xuống dòng
   * - trial_results bỏ time_trial_id; mỗi lần chạy duy nhất theo (lượt tập, số lần chạy)
   * - Cự ly chạy thử bỏ, dùng planned_distance_m của buổi
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD "target_time_ms" integer`,
    );
    await queryRunner.query(
      `UPDATE "training_sessions" s
          SET "target_time_ms" = CASE WHEN s."session_type" = 'TIME_TRIAL' THEN t."target_time_ms" END,
              "notes" = CASE
                WHEN t."notes" IS NULL THEN s."notes"
                WHEN s."notes" IS NULL THEN t."notes"
                ELSE s."notes" || E'\\n' || t."notes"
              END
         FROM "time_trials" t
        WHERE t."session_id" = s."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_target_time_ck" CHECK ("session_type" = 'TIME_TRIAL' OR "target_time_ms" IS NULL)`,
    );
    await queryRunner.query(`DROP INDEX "trial_results_attempt_uq"`);
    await queryRunner.query(
      `ALTER TABLE "trial_results" DROP CONSTRAINT "FK_trial_results_time_trial"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trial_results" DROP COLUMN "time_trial_id"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "trial_results_attempt_uq" ON "trial_results" ("session_participant_id", "attempt_no")`,
    );
    await queryRunner.query(`DROP TABLE "time_trials"`);
  }

  /**
   * Dựng lại bảng time_trials từ các buổi TIME_TRIAL và nối lại trial_results
   *
   * - Mỗi buổi TIME_TRIAL có một cấu hình: cự ly theo planned_distance_m, thời gian mục tiêu theo target_time_ms, ghi chú null
   * - Ghi chú đã gộp vào buổi giữ ở buổi
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "time_trials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL,
        "session_id" uuid NOT NULL,
        "legacy_distance_meters" numeric,
        "legacy_duration_seconds" numeric,
        "legacy_video_asset_id" uuid,
        "notes" text,
        "distance_m" numeric(10,2) NOT NULL,
        "target_time_ms" bigint,
        CONSTRAINT "PK_46248a8860224b5f6160d346641" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_200aaf44157db869b56448527d9" UNIQUE ("session_id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "time_trials_session_uq" ON "time_trials" ("session_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_trials" ADD CONSTRAINT "FK_time_trials_session" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `INSERT INTO "time_trials" ("version", "session_id", "distance_m", "target_time_ms")
       SELECT 1, "id", "planned_distance_m", "target_time_ms"
         FROM "training_sessions"
        WHERE "session_type" = 'TIME_TRIAL'`,
    );
    await queryRunner.query(`DROP INDEX "trial_results_attempt_uq"`);
    await queryRunner.query(
      `ALTER TABLE "trial_results" ADD "time_trial_id" uuid`,
    );
    await queryRunner.query(
      `UPDATE "trial_results" r
          SET "time_trial_id" = t."id"
         FROM "session_participants" p
         JOIN "time_trials" t ON t."session_id" = p."session_id"
        WHERE p."id" = r."session_participant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trial_results" ALTER COLUMN "time_trial_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "trial_results" ADD CONSTRAINT "FK_trial_results_time_trial" FOREIGN KEY ("time_trial_id") REFERENCES "time_trials"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "trial_results_attempt_uq" ON "trial_results" ("time_trial_id", "session_participant_id", "attempt_no")`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP CONSTRAINT "training_sessions_target_time_ck"`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" DROP COLUMN "target_time_ms"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingNoDrafts1789827100000 implements MigrationInterface {
  name = 'TrainingNoDrafts1789827100000';

  /**
   * Bỏ trạng thái nháp của lớp và của buổi tập
   *
   * - Lớp nháp chuyển sang đang chạy; lớp mới mặc định đang chạy
   * - Buổi nháp chuyển sang đã lên lịch; buổi mới mặc định đã lên lịch
   * - Buổi nháp vừa chuyển nhận lượt tập chờ điểm danh cho mỗi ngựa có khoảng ghi danh chưa hủy chứa giờ bắt đầu, kèm Groom phụ trách ngựa lúc đó
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi dữ liệu và mặc định
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "training_classes" SET "status" = 'ACTIVE' WHERE "status" = 'DRAFT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_classes" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`,
    );
    await queryRunner.query(
      `INSERT INTO "session_participants" ("version", "session_id", "horse_id", "horse_enrollment_id", "assigned_groom_id", "status")
       SELECT 1, s."id", e."horse_id", e."id",
              (SELECT g."groom_id" FROM "groom_assignments" g
                WHERE g."horse_id" = e."horse_id"
                  AND g."start_at" <= s."scheduled_start_at"
                  AND (g."end_at" IS NULL OR s."scheduled_start_at" < g."end_at")
                ORDER BY g."start_at" DESC
                LIMIT 1),
              'PLANNED'
         FROM "training_sessions" s
         JOIN "horse_enrollments" e
           ON e."class_id" = s."class_id"
          AND e."status" <> 'CANCELLED'
          AND e."enrolled_at" <= s."scheduled_start_at"
          AND (e."left_at" IS NULL OR s."scheduled_start_at" < e."left_at")
        WHERE s."status" = 'DRAFT'
          AND NOT EXISTS (
            SELECT 1 FROM "session_participants" p
             WHERE p."session_id" = s."id" AND p."horse_id" = e."horse_id"
          )`,
    );
    await queryRunner.query(
      `UPDATE "training_sessions" SET "status" = 'SCHEDULED' WHERE "status" = 'DRAFT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED'`,
    );
  }

  /**
   * Trả mặc định nháp cho lớp và buổi tập mới; dữ liệu đã chuyển giữ nguyên
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi mặc định
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "training_sessions" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "training_classes" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
  }
}

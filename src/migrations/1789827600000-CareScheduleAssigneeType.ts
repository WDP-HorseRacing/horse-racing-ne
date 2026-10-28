import { MigrationInterface, QueryRunner } from 'typeorm';

export class CareScheduleAssigneeType1789827600000 implements MigrationInterface {
  name = 'CareScheduleAssigneeType1789827600000';

  /**
   * Thêm kiểu giao cho lịch chăm sóc và chuyển dữ liệu cũ
   *
   * - Giao bác sĩ: VET, giữ bác sĩ
   * - Lịch còn Đã lên lịch giao cho người khác bác sĩ: GROOM, bỏ người (theo Groom đang phụ trách ngựa)
   * - Lịch đã hoàn tất hoặc đã hủy giao cho người khác bác sĩ: GROOM, giữ người để giữ lịch sử
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD "assignee_type" character varying(16)`,
    );
    await queryRunner.query(
      `UPDATE "care_schedules" s
          SET "assignee_type" = CASE WHEN u."role" = 'VETERINARIAN' THEN 'VET' ELSE 'GROOM' END,
              "assigned_to" = CASE
                WHEN u."role" <> 'VETERINARIAN' AND s."status" = 'SCHEDULED' THEN NULL
                ELSE s."assigned_to"
              END
         FROM "users" u
        WHERE u."id" = s."assigned_to"`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "care_schedules_assignee_ck" CHECK ((assignee_type IS NULL AND assigned_to IS NULL) OR assignee_type = 'GROOM' OR (assignee_type = 'VET' AND assigned_to IS NOT NULL))`,
    );
  }

  /**
   * Bỏ kiểu giao; lịch còn Đã lên lịch giao Groom phụ trách được ghi tên Groom đang phụ trách ngựa
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "care_schedules_assignee_ck"`,
    );
    await queryRunner.query(
      `UPDATE "care_schedules" s
          SET "assigned_to" = ga."groom_id"
         FROM "groom_assignments" ga
        WHERE s."assignee_type" = 'GROOM'
          AND s."assigned_to" IS NULL
          AND ga."horse_id" = s."horse_id"
          AND ga."end_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP COLUMN "assignee_type"`,
    );
  }
}

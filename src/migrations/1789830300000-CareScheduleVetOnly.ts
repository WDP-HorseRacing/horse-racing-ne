import { MigrationInterface, QueryRunner } from 'typeorm';

export class CareScheduleVetOnly1789830300000 implements MigrationInterface {
  name = 'CareScheduleVetOnly1789830300000';

  /**
   * Bỏ kiểu giao của lịch chăm sóc, chỉ còn giao bác sĩ hoặc chưa giao ai
   *
   * - Lịch đang giao Groom (Groom phụ trách hoặc Groom đích danh, mọi trạng thái): về chưa giao ai
   * - Lịch giao bác sĩ: giữ bác sĩ
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP CONSTRAINT "care_schedules_assignee_ck"`,
    );
    await queryRunner.query(
      `UPDATE "care_schedules" SET "assigned_to" = NULL WHERE "assignee_type" = 'GROOM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" DROP COLUMN "assignee_type"`,
    );
  }

  /**
   * Thêm lại kiểu giao: lịch có người được giao là VET, còn lại là chưa giao ai
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD "assignee_type" character varying(16)`,
    );
    await queryRunner.query(
      `UPDATE "care_schedules" SET "assignee_type" = 'VET' WHERE "assigned_to" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "care_schedules" ADD CONSTRAINT "care_schedules_assignee_ck" CHECK ((assignee_type IS NULL AND assigned_to IS NULL) OR assignee_type = 'GROOM' OR (assignee_type = 'VET' AND assigned_to IS NOT NULL))`,
    );
  }
}

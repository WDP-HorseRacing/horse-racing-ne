import { MigrationInterface, QueryRunner } from 'typeorm';

export class SessionParticipantStoppedReason1789827900000 implements MigrationInterface {
  name = 'SessionParticipantStoppedReason1789827900000';

  /**
   * Thêm cột lý do dừng sớm cho lượt tập
   *
   * - Lượt cũ để trống
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "session_participants" ADD "stopped_reason" text`,
    );
  }

  /**
   * Bỏ cột lý do dừng sớm; lượt dừng sớm chuyển về hoàn thành
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "session_participants" SET "status" = 'COMPLETED' WHERE "status" = 'STOPPED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_participants" DROP COLUMN "stopped_reason"`,
    );
  }
}

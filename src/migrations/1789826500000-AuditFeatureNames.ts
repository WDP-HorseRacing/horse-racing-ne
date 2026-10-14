import { MigrationInterface, QueryRunner } from 'typeorm';

const RENAMES: [old: string, name: string][] = [
  ['F1.2', 'HORSE_CREATE'],
  ['F1.4', 'HORSE_UPDATE'],
  ['F1.5', 'HORSE_MEASURE'],
  ['F1.7', 'STALL_GROOM'],
  ['F1.8', 'HORSE_LIFECYCLE'],
  ['F3.2', 'MED_CHECKUP'],
  ['F3.3', 'MED_VISIT'],
  ['F3.4', 'MED_EXAM_REQUEST'],
  ['F3.5', 'MED_CASE_OPEN'],
  ['F3.6', 'MED_CASE_VISIT'],
  ['F3.7', 'MED_HEALTH'],
  ['F3.8', 'MED_TRAIN_LOCK'],
  ['F3.9', 'MED_CASE_CLOSE'],
  ['F3.11', 'MED_CARE'],
];

export class AuditFeatureNames1789826500000 implements MigrationInterface {
  name = 'AuditFeatureNames1789826500000';

  /**
   * Đổi mã chức năng trong nhật ký thao tác từ số mục đặc tả sang tên chức năng
   *
   * - F1.6 trên khu chuồng thành BARN, trên đối tượng khác thành HORSE_BARN
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [old, name] of RENAMES) {
      await queryRunner.query(
        `UPDATE "audit_logs" SET "feature" = $2 WHERE "feature" = $1`,
        [old, name],
      );
    }
    await queryRunner.query(
      `UPDATE "audit_logs"
          SET "feature" = CASE WHEN "entity_type" = 'BARN' THEN 'BARN' ELSE 'HORSE_BARN' END
        WHERE "feature" = 'F1.6'`,
    );
  }

  /**
   * Trả mã chức năng trong nhật ký thao tác về số mục đặc tả
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [old, name] of RENAMES) {
      await queryRunner.query(
        `UPDATE "audit_logs" SET "feature" = $1 WHERE "feature" = $2`,
        [old, name],
      );
    }
    await queryRunner.query(
      `UPDATE "audit_logs" SET "feature" = 'F1.6' WHERE "feature" IN ('BARN', 'HORSE_BARN')`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplyUsageReversal1789827800000 implements MigrationInterface {
  name = 'SupplyUsageReversal1789827800000';

  /**
   * Thêm mã lần xuất cho sổ nhập xuất và chặn hủy một lần xuất hai lần
   *
   * - Dòng cũ để mã lần xuất trống, không hủy được
   * - Mỗi lô của một lần xuất chỉ có tối đa một dòng hủy
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "supply_stock_movements" ADD "usage_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "supply_stock_movements_usage_idx" ON "supply_stock_movements" ("usage_id") WHERE "usage_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "supply_stock_movements_reversal_uq" ON "supply_stock_movements" ("usage_id", "lot_id") WHERE "type" = 'USAGE_REVERSAL'`,
    );
  }

  /**
   * Bỏ mã lần xuất; dòng hủy được giữ nguyên trong sổ
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."supply_stock_movements_reversal_uq"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."supply_stock_movements_usage_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_stock_movements" DROP COLUMN "usage_id"`,
    );
  }
}

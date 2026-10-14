import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplyLots1789826600000 implements MigrationInterface {
  name = 'SupplyLots1789826600000';

  /**
   * Thêm lô vật tư (đơn giá, số còn) và gắn dòng sổ nhập xuất với lô; bỏ thông tin kiểm kê gần nhất
   *
   * - Vật tư đang có tồn được chuyển thành một lô giá 0 bằng số tồn hiện tại, ngày lô là ngày thêm vật tư
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và chuyển dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "supply_lots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "item_id" uuid NOT NULL, "quantity" numeric(12,2) NOT NULL, "remaining" numeric(12,2) NOT NULL, "unit_price" bigint NOT NULL, CONSTRAINT "supply_lots_quantity_positive_ck" CHECK ("quantity" > 0), CONSTRAINT "supply_lots_remaining_range_ck" CHECK ("remaining" >= 0 AND "remaining" <= "quantity"), CONSTRAINT "supply_lots_unit_price_nonnegative_ck" CHECK ("unit_price" >= 0), CONSTRAINT "PK_supply_lots" PRIMARY KEY ("id"), CONSTRAINT "supply_lots_item_fk" FOREIGN KEY ("item_id") REFERENCES "supply_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "supply_lots_item_created_idx" ON "supply_lots" ("item_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_stock_movements" ADD "lot_id" uuid, ADD CONSTRAINT "supply_stock_movements_lot_fk" FOREIGN KEY ("lot_id") REFERENCES "supply_lots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "supply_lots" ("version", "item_id", "quantity", "remaining", "unit_price", "created_at", "updated_at")
       SELECT 1, "id", "quantity_on_hand", "quantity_on_hand", 0, "created_at", now()
         FROM "supply_items" WHERE "quantity_on_hand" > 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_items" DROP CONSTRAINT "supply_items_last_counted_by_fk", DROP COLUMN "last_counted_by", DROP COLUMN "last_counted_at"`,
    );
  }

  /**
   * Bỏ lô vật tư và liên kết lô trên dòng sổ; trả lại cột kiểm kê gần nhất (để trống)
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "supply_items" ADD "last_counted_at" TIMESTAMP WITH TIME ZONE, ADD "last_counted_by" uuid, ADD CONSTRAINT "supply_items_last_counted_by_fk" FOREIGN KEY ("last_counted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_stock_movements" DROP CONSTRAINT "supply_stock_movements_lot_fk", DROP COLUMN "lot_id"`,
    );
    await queryRunner.query(`DROP TABLE "supply_lots"`);
  }
}

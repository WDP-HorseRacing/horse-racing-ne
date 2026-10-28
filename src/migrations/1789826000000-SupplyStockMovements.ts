import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplyStockMovements1789826000000 implements MigrationInterface {
  name = 'SupplyStockMovements1789826000000';

  /**
   * Thêm sổ nhập xuất vật tư và thông tin kiểm kê gần nhất
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "supply_items" ADD "last_counted_at" TIMESTAMP WITH TIME ZONE, ADD "last_counted_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_items" ADD CONSTRAINT "supply_items_last_counted_by_fk" FOREIGN KEY ("last_counted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "supply_stock_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "item_id" uuid NOT NULL, "delta" numeric(12,2) NOT NULL, "balance_after" numeric(12,2) NOT NULL, "type" character varying(32) NOT NULL, "request_id" uuid, "note" text, "created_by" uuid NOT NULL, CONSTRAINT "PK_supply_stock_movements" PRIMARY KEY ("id"), CONSTRAINT "supply_stock_movements_item_fk" FOREIGN KEY ("item_id") REFERENCES "supply_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "supply_stock_movements_request_fk" FOREIGN KEY ("request_id") REFERENCES "supply_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "supply_stock_movements_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "supply_stock_movements_item_created_idx" ON "supply_stock_movements" ("item_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "supply_stock_movements_request_uq" ON "supply_stock_movements" ("request_id") WHERE request_id IS NOT NULL`,
    );
  }

  /**
   * Bỏ sổ nhập xuất vật tư và thông tin kiểm kê gần nhất
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "supply_stock_movements"`);
    await queryRunner.query(
      `ALTER TABLE "supply_items" DROP CONSTRAINT "supply_items_last_counted_by_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_items" DROP COLUMN "last_counted_by", DROP COLUMN "last_counted_at"`,
    );
  }
}

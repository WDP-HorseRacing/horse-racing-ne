import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplyItemNameCaseInsensitive1789830140000 implements MigrationInterface {
  name = 'SupplyItemNameCaseInsensitive1789830140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const clashes = (await queryRunner.query(
      `SELECT string_agg('"' || "name" || '"', ', ' ORDER BY "name") AS "names"
         FROM "supply_items"
        WHERE "deleted_at" IS NULL
        GROUP BY lower("name")
       HAVING count(*) > 1
        ORDER BY lower("name")`,
    )) as Array<{ names: string }>;
    if (clashes.length > 0) {
      throw new Error(
        `Tên vật tư trùng nhau khi không phân biệt hoa thường: ${clashes
          .map((clash) => clash.names)
          .join('; ')}. Đổi tên hoặc xóa bớt rồi chạy lại migration`,
      );
    }
    await queryRunner.query(`DROP INDEX "public"."supply_items_name_uq"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "supply_items_name_uq" ON "supply_items" (lower("name")) WHERE deleted_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."supply_items_name_uq"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "supply_items_name_uq" ON "supply_items" ("name") WHERE deleted_at IS NULL`,
    );
  }
}

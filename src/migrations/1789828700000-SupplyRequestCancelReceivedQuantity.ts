import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplyRequestCancelReceivedQuantity1789828700000 implements MigrationInterface {
  name = 'SupplyRequestCancelReceivedQuantity1789828700000';

  /**
   * Đổi cột quantity của supply_requests thành số lượng thực nhận khi cấp và thêm thông tin hủy đề xuất
   *
   * - quantity cho phép null; đề xuất chưa FULFILLED đặt về null, đề xuất FULFILLED giữ số đã cộng vào tồn
   * - Thêm cancelled_by (khóa ngoại users), cancelled_at, cancellation_reason
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ALTER COLUMN "quantity" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "supply_requests" SET "quantity" = NULL WHERE "status" <> 'FULFILLED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ADD "cancelled_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ADD "cancelled_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ADD "cancellation_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ADD CONSTRAINT "FK_be694ffb8330886d2fec3ae9f29" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  /**
   * Bỏ thông tin hủy và đưa quantity về bắt buộc
   *
   * - Đề xuất CANCELLED chuyển thành REJECTED, lý do hủy chép sang rejection_reason
   * - quantity đang null đặt bằng 1 vì số lượng xin ban đầu không còn lưu
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "supply_requests"
          SET "status" = 'REJECTED', "rejection_reason" = "cancellation_reason"
        WHERE "status" = 'CANCELLED'`,
    );
    await queryRunner.query(
      `UPDATE "supply_requests" SET "quantity" = 1 WHERE "quantity" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" ALTER COLUMN "quantity" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" DROP CONSTRAINT "FK_be694ffb8330886d2fec3ae9f29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" DROP COLUMN "cancellation_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" DROP COLUMN "cancelled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_requests" DROP COLUMN "cancelled_by"`,
    );
  }
}

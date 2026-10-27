import { MigrationInterface, QueryRunner } from 'typeorm';

export class InjuryPositionRequired1789827400000 implements MigrationInterface {
  name = 'InjuryPositionRequired1789827400000';

  /**
   * Bắt buộc mọi chấn thương có tọa độ trên mô hình 3D
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   * @throws QueryFailedError Nếu còn chấn thương chưa có tọa độ
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ALTER COLUMN "position" SET NOT NULL`,
    );
  }

  /**
   * Cho phép chấn thương không có tọa độ
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ALTER COLUMN "position" DROP NOT NULL`,
    );
  }
}

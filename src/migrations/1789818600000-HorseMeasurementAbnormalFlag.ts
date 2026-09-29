import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lưu cờ bất thường của chỉ số cơ thể tại lúc ghi và tính bù cho bản ghi cũ theo khoảng bình thường hiện hành.
 */
export class HorseMeasurementAbnormalFlag1789818600000 implements MigrationInterface {
  name = 'HorseMeasurementAbnormalFlag1789818600000';

  /**
   * Thêm cột is_abnormal và tính bù cho bản ghi đã có
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns A promise resolving khi đã thêm cột và tính bù xong
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD "is_abnormal" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`
      UPDATE "horse_measurements"
         SET "is_abnormal" = CASE "type"
           WHEN 'WEIGHT' THEN "value" < 400 OR "value" > 600
           WHEN 'HEIGHT' THEN "value" < 150 OR "value" > 175
           WHEN 'BODY_CONDITION' THEN "value" < 4 OR "value" > 6
           WHEN 'TEMPERATURE' THEN "value" < 37.2 OR "value" > 38.3
           ELSE false
         END
    `);
  }

  /**
   * Bỏ cột is_abnormal
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns A promise resolving khi đã bỏ cột
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP COLUMN "is_abnormal"`,
    );
  }
}

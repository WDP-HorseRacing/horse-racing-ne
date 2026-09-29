import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Các cột cũ mà entity không còn ghi; migration bỏ NOT NULL, giữ nguyên cột và dữ liệu.
 */
const LEGACY_COLUMNS: Array<[table: string, column: string]> = [
  ['training_plans', 'legacy_horse_id'],
  ['training_sessions', 'scheduled_at'],
  ['training_sessions', 'distance_km'],
  ['training_sessions', 'intensity'],
  ['time_trials', 'legacy_distance_meters'],
  ['time_trials', 'legacy_duration_seconds'],
  ['performance_metrics', 'legacy_session_id'],
  ['performance_evaluations', 'legacy_session_id'],
];

export class RelaxLegacyTrainingColumns1789818500000 implements MigrationInterface {
  name = 'RelaxLegacyTrainingColumns1789818500000';

  /**
   * Bỏ NOT NULL cho các cột cũ để entity mới lưu được
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns A promise resolving khi đã đổi xong mọi cột
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of LEGACY_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL`,
      );
    }
  }

  /**
   * Đặt lại NOT NULL như trước
   *
   * - Lỗi nếu đã có dòng để trống các cột này
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns A promise resolving khi đã đổi xong mọi cột
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of LEGACY_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`,
      );
    }
  }
}

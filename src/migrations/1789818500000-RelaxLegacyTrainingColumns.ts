import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Các cột cũ còn NOT NULL sau khi chuyển sang mô hình lớp học (TrainingClassParticipantRefactor).
 * Entity mới không ghi các cột này, nên mọi lần tạo giáo án, buổi tập, time trial, chỉ số hiệu suất và đánh giá đều lỗi.
 * Giữ nguyên cột và dữ liệu cũ để còn đối chiếu, chỉ bỏ NOT NULL.
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
   * - Chỉ chạy được khi chưa có dòng mới nào để trống các cột này (dòng tạo sau migration này sẽ làm down lỗi)
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

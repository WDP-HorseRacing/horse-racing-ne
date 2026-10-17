import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransferredHorsesEndOwnership1789827500000 implements MigrationInterface {
  name = 'TransferredHorsesEndOwnership1789827500000';

  /**
   * Kết thúc sở hữu của các ngựa đã chuyển nhượng ra ngoài
   *
   * - Đóng giai đoạn sở hữu còn mở tại lần đổi vòng đời gần nhất (không có thì lúc chạy migration)
   * - Bỏ trống chủ của ngựa đã chuyển nhượng
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE horse_ownerships o
          SET ended_at = GREATEST(COALESCE(h.lifecycle_changed_at, now()), o.started_at)
         FROM horses h
        WHERE h.id = o.horse_id
          AND h.lifecycle_status = 'TRANSFERRED'
          AND o.ended_at IS NULL`,
    );
    await queryRunner.query(
      `UPDATE horses SET owner_id = NULL
        WHERE lifecycle_status = 'TRANSFERRED' AND owner_id IS NOT NULL`,
    );
  }

  /**
   * Trả chủ cho ngựa đã chuyển nhượng: mở lại giai đoạn sở hữu gần nhất và gán lại chủ của giai đoạn đó
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `WITH latest AS (
         SELECT DISTINCT ON (o.horse_id) o.id, o.horse_id, o.owner_id
           FROM horse_ownerships o
           JOIN horses h ON h.id = o.horse_id
          WHERE h.lifecycle_status = 'TRANSFERRED' AND h.owner_id IS NULL
          ORDER BY o.horse_id, o.started_at DESC
       ), reopened AS (
         UPDATE horse_ownerships o SET ended_at = NULL
           FROM latest WHERE o.id = latest.id
         RETURNING latest.horse_id, latest.owner_id
       )
       UPDATE horses h SET owner_id = reopened.owner_id
         FROM reopened WHERE h.id = reopened.horse_id`,
    );
  }
}

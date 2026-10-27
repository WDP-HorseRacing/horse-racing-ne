import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HorseEnrollmentStatus } from '../../training/enums/horse-enrollment-status.enum';
import type { BarnChangeImpactRow } from '../types/horse.types';

/**
 * Các câu đọc gom nhiều bảng để xem trước việc đổi khu. Chỉ đọc.
 */
@Injectable()
export class HorsePlacementsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Đếm những gì sẽ bị ảnh hưởng nếu ngựa đổi sang khu do Head Trainer đã cho phụ trách
   *
   * - Lớp bị rút là lớp đang học (enrollment ACTIVE) không do Head Trainer đó phụ trách
   *
   * @param horseId UUID của ngựa
   * @param newHeadTrainerId Head Trainer khu mới, null nếu khu mới chưa có
   * @returns Promise trả về khu hiện tại, ô, Groom và số lớp sẽ bị rút
   */
  async barnChangeImpact(
    horseId: string,
    newHeadTrainerId: string | null,
  ): Promise<BarnChangeImpactRow> {
    const rows = await this.dataSource.query<BarnChangeImpactRow[]>(
      `SELECT
         (SELECT b.name FROM horses h JOIN barns b ON b.id = h.barn_id
           WHERE h.id = $1) AS "fromBarnName",
         (SELECT s.code FROM stall_assignments sa JOIN stalls s ON s.id = sa.stall_id
           WHERE sa.horse_id = $1 AND sa.end_at IS NULL LIMIT 1) AS "stallCode",
         (SELECT u.full_name FROM groom_assignments ga JOIN users u ON u.id = ga.groom_id
           WHERE ga.horse_id = $1 AND ga.end_at IS NULL LIMIT 1) AS "groomName",
         (SELECT count(*)::int FROM horse_enrollments e
           JOIN training_classes c ON c.id = e.class_id
           WHERE e.horse_id = $1 AND e.status = $3
             AND ($2::uuid IS NULL OR c.head_trainer_id IS NULL OR c.head_trainer_id <> $2::uuid)) AS "classesToWithdraw"`,
      [horseId, newHeadTrainerId, HorseEnrollmentStatus.ACTIVE],
    );
    return rows[0];
  }
}

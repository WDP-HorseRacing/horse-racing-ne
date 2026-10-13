import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IncidentStatus } from '../../stable/constants/incident-status.enum';
import { HorseEnrollmentStatus } from '../../training/enums/horse-enrollment-status.enum';
import type { LifecycleImpactRow } from '../types/horse.types';

@Injectable()
export class HorseStatusesRepository {
  /**
   * Đếm những gì sẽ bị ảnh hưởng khi đổi vòng đời. Chỉ đọc.
   *
   * - Số lớp ngựa đang học (enrollment ACTIVE)
   * - Ô chuồng, groom và khu hiện tại
   * - Số sự cố tại chuồng đang mở
   * - Không đếm lệnh khóa huấn luyện đang ACTIVE
   *
   * @param manager EntityManager dùng để query
   * @param horseId UUID của ngựa
   * @returns Promise trả về số liệu hiện tại của ngựa, chưa gồm cờ khóa huấn luyện
   */
  async lifecycleImpact(
    manager: EntityManager,
    horseId: string,
  ): Promise<Omit<LifecycleImpactRow, 'hasActiveTrainingLock'>> {
    const rows: Array<Omit<LifecycleImpactRow, 'hasActiveTrainingLock'>> =
      await manager.query(
        `SELECT
         (SELECT count(DISTINCT he.class_id)::int FROM horse_enrollments he
           WHERE he.horse_id = $1 AND he.status = $2) AS "activeClasses",
         (SELECT s.code FROM stall_assignments sa JOIN stalls s ON s.id = sa.stall_id
           WHERE sa.horse_id = $1 AND sa.end_at IS NULL LIMIT 1) AS "stallCode",
         (SELECT u.full_name FROM groom_assignments ga JOIN users u ON u.id = ga.groom_id
           WHERE ga.horse_id = $1 AND ga.end_at IS NULL LIMIT 1) AS "groomName",
         (SELECT b.name FROM horses h JOIN barns b ON b.id = h.barn_id
           WHERE h.id = $1) AS "barnName",
         (SELECT count(*)::int FROM incidents i
           WHERE i.horse_id = $1 AND i.status = $3) AS "openIncidents"`,
        [horseId, HorseEnrollmentStatus.ACTIVE, IncidentStatus.OPEN],
      );
    return rows[0];
  }
}

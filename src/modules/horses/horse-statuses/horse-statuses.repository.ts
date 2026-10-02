import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  OPEN_REGISTRATION_STATUSES,
  UPCOMING_RACE_STATUSES,
} from '../../racing/constants/racing.constants';
import { HorseEnrollmentStatus } from '../../training/enums/horse-enrollment-status.enum';
import type { LifecycleImpactRow } from '../types/horse.types';

@Injectable()
export class HorseStatusesRepository {
  /**
   * Đếm những gì sẽ bị ảnh hưởng khi đổi vòng đời. Chỉ đọc.
   *
   * - Số lớp ngựa đang học (enrollment ACTIVE) và đăng ký thi đấu còn mở ở cuộc đua chưa diễn ra
   * - Ô chuồng, groom và khu hiện tại
   * - Lệnh khóa huấn luyện đang ACTIVE không đếm ở đây, nơi gọi lấy qua HorseAccessService.hasActiveTrainingLock
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
         (SELECT count(*)::int FROM race_registrations rr
           JOIN races r ON r.id = rr.race_id
           WHERE rr.horse_id = $1 AND rr.status = ANY($3) AND r.status = ANY($4)) AS "openRaceRegistrations",
         (SELECT s.code FROM stall_assignments sa JOIN stalls s ON s.id = sa.stall_id
           WHERE sa.horse_id = $1 AND sa.end_at IS NULL LIMIT 1) AS "stallCode",
         (SELECT u.full_name FROM groom_assignments ga JOIN users u ON u.id = ga.groom_id
           WHERE ga.horse_id = $1 AND ga.end_at IS NULL LIMIT 1) AS "groomName",
         (SELECT b.name FROM horses h JOIN barns b ON b.id = h.barn_id
           WHERE h.id = $1) AS "barnName"`,
        [
          horseId,
          HorseEnrollmentStatus.ACTIVE,
          OPEN_REGISTRATION_STATUSES,
          UPCOMING_RACE_STATUSES,
        ],
      );
    return rows[0];
  }
}

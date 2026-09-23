import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import {
  OPEN_REGISTRATION_STATUSES,
  UPCOMING_RACE_STATUSES,
} from '../../racing/constants/racing.constants';

import { TrainingPlanEntity } from '../../training/entities/training-plan.entity';
import { TrainingSessionEntity } from '../../training/entities/training-session.entity';
import { TrainingSessionStatus } from '../../training/enums/training-session-status.enum';
import { TrainingPlanStatus } from '../../training/enums/training-plan-status.enum';
import type { LifecycleImpactRow } from '../types/horse.types';

@Injectable()
export class HorseStatusesRepository {
  /**
   * Hủy mọi giáo án SCHEDULED/ACTIVE của ngựa, kèm các buổi tập SCHEDULED của chúng.
   *
   * - Buổi tập bị hủy ghi người hủy, thời điểm và lý do
   * - Giáo án đã COMPLETED/CANCELLED giữ nguyên làm lịch sử
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param actorId UUID của người thực hiện
   * @param reason Lý do hủy ghi vào giáo án và buổi tập
   * @param now Thời điểm hủy
   * @returns A promise resolving to số giáo án đã hủy, để ghi vào nhật ký
   */
  async cancelOpenTrainingPlans(
    manager: EntityManager,
    horseId: string,
    actorId: string,
    reason: string,
    now: Date,
  ): Promise<number> {
    const plans = await manager.getRepository(TrainingPlanEntity).find({
      select: { id: true },
      where: {
        horseId,
        status: In([TrainingPlanStatus.SCHEDULED, TrainingPlanStatus.ACTIVE]),
      },
    });
    if (plans.length === 0) return 0;
    const planIds = plans.map((plan) => plan.id);
    await manager.getRepository(TrainingSessionEntity).update(
      { planId: In(planIds), status: TrainingSessionStatus.SCHEDULED },
      {
        status: TrainingSessionStatus.CANCELLED,
        cancelledAt: now,
        cancelledBy: actorId,
        cancelReason: reason,
      },
    );
    await manager.getRepository(TrainingPlanEntity).update(
      { id: In(planIds) },
      {
        status: TrainingPlanStatus.CANCELLED,
        cancelledAt: now,
        cancelReason: reason,
      },
    );
    return plans.length;
  }

  /**
   * Đếm những gì sẽ bị ảnh hưởng khi đổi vòng đời, để hiện bảng xác nhận trước khi thực hiện (F1.8 mục 5). Chỉ đọc.
   *
   * - Giáo án đang mở (SCHEDULED/ACTIVE) và đăng ký thi đấu còn mở ở cuộc đua chưa diễn ra
   * - Ô chuồng, groom và khu hiện tại
   * - Lệnh khóa huấn luyện đang ACTIVE không đếm ở đây, nơi gọi lấy qua HorsesSharedRepository.hasActiveTrainingLock
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager dùng để query
   * @returns A promise resolving to số liệu hiện tại của ngựa, chưa gồm cờ khóa huấn luyện
   */
  async lifecycleImpact(
    horseId: string,
    manager: EntityManager,
  ): Promise<Omit<LifecycleImpactRow, 'hasActiveTrainingLock'>> {
    const rows: Array<Omit<LifecycleImpactRow, 'hasActiveTrainingLock'>> =
      await manager.query(
        `SELECT
         (SELECT count(*)::int FROM training_plans p
           WHERE p.horse_id = $1 AND p.status = ANY($2)) AS "openTrainingPlans",
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
          [TrainingPlanStatus.SCHEDULED, TrainingPlanStatus.ACTIVE],
          OPEN_REGISTRATION_STATUSES,
          UPCOMING_RACE_STATUSES,
        ],
      );
    return rows[0];
  }
}

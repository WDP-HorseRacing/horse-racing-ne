import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { RaceStatus } from '../../racing/constants/race-status.enum';
import { RegistrationStatus } from '../../racing/constants/registration-status.enum';
import { RaceRegistrationEntity } from '../../racing/entities/race-registration.entity';
import { StallStatus } from '../../stable/constants/stall-status.enum';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { StallAssignmentEntity } from '../../stable/entities/stall-assignment.entity';
import { StallEntity } from '../../stable/entities/stall.entity';

import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';

const OPEN_REGISTRATION_STATUSES = [
  RegistrationStatus.PROPOSED,
  RegistrationStatus.OWNER_APPROVED,
  RegistrationStatus.MANAGER_CONFIRMED,
];

@Injectable()
export class HorseStatusesRepository {
  constructor(private readonly training: TrainingOperationsFacade) {}
  /**
   * Kiểm tra ngựa có đang dở hoạt động không thể hủy ngang không.
   *
   * - Có buổi tập IN_PROGRESS thuộc giáo án của ngựa
   * - Hoặc có đăng ký còn mở ở cuộc đua đang IN_PROGRESS
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise trả về true nếu ngựa đang tập hoặc đang đua
   */
  async hasRunningActivity(
    manager: EntityManager,
    horseId: string,
  ): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await manager.query(
      `SELECT (
         EXISTS (
           SELECT 1 FROM session_participants sp
           WHERE sp.horse_id = $1 AND sp.status = $2
         )
         OR EXISTS (
           SELECT 1 FROM race_registrations rr
           JOIN races r ON r.id = rr.race_id
           WHERE rr.horse_id = $1 AND r.status = $3 AND rr.status = ANY($4)
         )
       ) AS exists`,
      [
        horseId,
        SessionParticipantStatus.ONGOING,
        RaceStatus.IN_PROGRESS,
        OPEN_REGISTRATION_STATUSES,
      ],
    );
    return rows[0]?.exists === true;
  }

  /**
   * Hủy các future participant còn mở của ngựa.
   *
   * Không hủy TrainingPlan/TrainingSession dùng chung cho các Horse khác trong
   * cùng Class; lịch sử participant của các buổi cũ vẫn giữ nguyên.
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param actorId UUID của người thực hiện
   * @param reason Lý do hủy ghi vào giáo án và buổi tập
   * @param now Thời điểm hủy
   * @returns Promise hoàn tất khi đã hủy
   */
  async cancelFutureTrainingParticipations(
    manager: EntityManager,
    horseId: string,
    actorId: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    await this.training.cancelFutureParticipationsByLifecycle(
      manager,
      horseId,
      `${reason} (actor: ${actorId})`,
      now,
    );
  }

  /**
   * Rút các đăng ký thi đấu còn mở của ngựa ở cuộc đua chưa kết thúc, chuyển sang WITHDRAWN.
   *
   * - Chỉ đụng tới cuộc đua PLANNED/OPEN; kết quả đua cũ giữ nguyên
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise hoàn tất khi đã rút
   */
  async withdrawOpenRegistrations(
    manager: EntityManager,
    horseId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(RaceRegistrationEntity)
      .set({ status: RegistrationStatus.WITHDRAWN })
      .where('horse_id = :horseId', { horseId })
      .andWhere('status IN (:...open)', { open: OPEN_REGISTRATION_STATUSES })
      .andWhere(
        'race_id IN (SELECT id FROM races WHERE status IN (:...upcoming))',
        { upcoming: [RaceStatus.PLANNED, RaceStatus.OPEN] },
      )
      .execute();
  }

  /**
   * Tự gỡ khóa huấn luyện đang ACTIVE của ngựa. releasedBy để null vì hệ thống gỡ, không phải bác sĩ.
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param conclusion Kết luận ghi vào khóa, nói rõ lý do tự gỡ
   * @param now Thời điểm gỡ
   * @returns Promise hoàn tất khi đã gỡ
   */
  async releaseActiveTrainingLock(
    manager: EntityManager,
    horseId: string,
    conclusion: string,
    now: Date,
  ): Promise<void> {
    await manager.getRepository(TrainingLockEntity).update(
      { horseId, status: TrainingLockStatus.ACTIVE },
      {
        status: TrainingLockStatus.RELEASED,
        releasedBy: null,
        releasedAt: now,
        releaseConclusion: conclusion,
      },
    );
  }

  /**
   * Close the open groom assignment of a horse within a transaction
   * @param manager The transaction entity manager
   * @param horseId The ID of the horse
   * @param endAt The time to set as the end of the open assignment
   * @returns A promise that resolves once the assignment is closed
   */
  async closeActiveGroomAssignment(
    manager: EntityManager,
    horseId: string,
    endAt: Date,
  ): Promise<void> {
    await manager
      .getRepository(GroomAssignmentEntity)
      .update({ horseId, endAt: IsNull() }, { endAt });
  }

  /**
   * Close the open stall assignment of a horse and free its stall within a transaction
   * @param manager The transaction entity manager
   * @param horseId The ID of the horse
   * @param endAt The time to set as the end of the open assignment
   * @returns A promise that resolves once the assignment is closed and an OCCUPIED stall is set back to AVAILABLE
   */
  async closeActiveStallAssignment(
    manager: EntityManager,
    horseId: string,
    endAt: Date,
  ): Promise<void> {
    const assignments = manager.getRepository(StallAssignmentEntity);
    const open = await assignments.findOneBy({ horseId, endAt: IsNull() });
    if (!open) return;
    await assignments.update({ id: open.id }, { endAt });
    await manager
      .getRepository(StallEntity)
      .update(
        { id: open.stallId, status: StallStatus.OCCUPIED },
        { status: StallStatus.AVAILABLE },
      );
  }
}

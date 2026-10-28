import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { assertClassCompletable } from '../policies/training.policy';

/**
 * Hoàn thành lớp trong transaction đang chạy và ghi nhật ký đổi trạng thái
 *
 * - Người gọi phải khóa row lớp và kiểm tra quyền trước khi gọi
 * - Ngựa đang học trong lớp (ACTIVE) chuyển sang rời lớp (LEFT), thời điểm rời là lúc hoàn thành
 *
 * @param manager EntityManager của transaction đang chạy
 * @param auditService Service ghi nhật ký
 * @param row Lớp đã khóa
 * @param actorId UUID người hoàn thành, null khi hệ thống tự hoàn thành
 * @param reason Lý do ghi nhật ký, null khi không có
 * @returns Promise trả về lớp sau khi hoàn thành
 * @throws ConflictException Nếu lớp không ở trạng thái hoàn thành được hoặc còn buổi tập chưa kết thúc
 */
export async function completeTrainingClass(
  manager: EntityManager,
  auditService: AuditService,
  row: TrainingClassEntity,
  actorId: string | null,
  reason: string | null,
): Promise<TrainingClassEntity> {
  assertClassCompletable(row.status);
  const previousStatus = row.status;

  const unfinishedSessions = await manager
    .getRepository(TrainingSessionEntity)
    .createQueryBuilder('session')
    .where('session.class_id = :classId', { classId: row.id })
    .andWhere('session.status IN (:...statuses)', {
      statuses: [
        TrainingSessionStatus.SCHEDULED,
        TrainingSessionStatus.IN_PROGRESS,
      ],
    })
    .getCount();
  if (unfinishedSessions) {
    throw new ConflictException('Lớp vẫn còn buổi tập chưa kết thúc');
  }

  const now = new Date();
  await manager.update(
    HorseEnrollmentEntity,
    { classId: row.id, status: HorseEnrollmentStatus.ACTIVE },
    { status: HorseEnrollmentStatus.LEFT, leftAt: now },
  );
  row.status = TrainingClassStatus.COMPLETED;
  row.completedAt = now;
  const saved = await manager.save(row);
  await auditService.record(manager, {
    actorId,
    action: AuditAction.UPDATE,
    entityType: AuditEntityType.TRAINING_CLASS,
    entityId: saved.id,
    before: { status: previousStatus },
    after: { status: saved.status },
    reason,
    feature: AuditFeature.TRAIN_CLASS,
  });
  return saved;
}

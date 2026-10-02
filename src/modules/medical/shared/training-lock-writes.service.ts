import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { TrainingLockEntity } from '../entities/training-lock.entity';

/**
 * Thông tin gỡ một lệnh khóa huấn luyện
 */
export interface TrainingLockRelease {
  releasedBy: string | null;
  releasedAt: Date;
  releaseConclusion: string;
}

/**
 * Các câu ghi dùng chung lên bảng training_locks, luôn chạy trong transaction đang mở
 */
@Injectable()
export class TrainingLockWritesService {
  /**
   * Gỡ một lệnh khóa huấn luyện
   *
   * @param manager EntityManager của transaction đang chạy
   * @param lockId UUID của lệnh khóa
   * @param release Người gỡ, thời điểm gỡ và kết luận
   * @returns Promise trả về các field vừa ghi vào lệnh khóa
   */
  async releaseLock(
    manager: EntityManager,
    lockId: string,
    release: TrainingLockRelease,
  ): Promise<TrainingLockRelease & { status: TrainingLockStatus }> {
    const changes = { status: TrainingLockStatus.RELEASED, ...release };
    await manager.update(TrainingLockEntity, { id: lockId }, changes);
    return changes;
  }

  /**
   * Gỡ lệnh khóa đang ACTIVE của con ngựa, không ghi người gỡ
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param conclusion Kết luận ghi vào lệnh khóa
   * @returns Promise trả về số lệnh khóa đã gỡ
   */
  async releaseActiveLockOfHorse(
    manager: EntityManager,
    horseId: string,
    conclusion: string,
  ): Promise<number> {
    const result = await manager.getRepository(TrainingLockEntity).update(
      { horseId, status: TrainingLockStatus.ACTIVE },
      {
        status: TrainingLockStatus.RELEASED,
        releasedAt: new Date(),
        releasedBy: null,
        releaseConclusion: conclusion,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Đổi ngày dự kiến kết thúc của một lệnh khóa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param lockId UUID của lệnh khóa
   * @param lockEnd Ngày dự kiến kết thúc mới
   * @returns Promise hoàn tất khi đã ghi
   */
  async extendLockEnd(
    manager: EntityManager,
    lockId: string,
    lockEnd: Date | undefined,
  ): Promise<void> {
    await manager.update(TrainingLockEntity, { id: lockId }, { lockEnd });
  }

  /**
   * Gắn lệnh khóa ACTIVE chưa thuộc bệnh án nào của con ngựa vào một bệnh án
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param caseId UUID của bệnh án
   * @returns Promise trả về số lệnh khóa đã gắn
   */
  async attachActiveLockToCase(
    manager: EntityManager,
    horseId: string,
    caseId: string,
  ): Promise<number> {
    const result = await manager.update(
      TrainingLockEntity,
      { horseId, status: TrainingLockStatus.ACTIVE, caseId: IsNull() },
      { caseId },
    );
    return result.affected ?? 0;
  }

  /**
   * Tách mọi lệnh khóa khỏi một bệnh án, bản thân lệnh khóa giữ nguyên
   *
   * @param manager EntityManager của transaction đang chạy
   * @param caseId UUID của bệnh án
   * @returns Promise trả về số lệnh khóa đã tách
   */
  async detachLocksFromCase(
    manager: EntityManager,
    caseId: string,
  ): Promise<number> {
    const result = await manager.update(
      TrainingLockEntity,
      { caseId },
      { caseId: null },
    );
    return result.affected ?? 0;
  }
}

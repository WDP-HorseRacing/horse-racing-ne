import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { TrainingLockEntity } from '../entities/training-lock.entity';

@Injectable()
export class TrainingLockService {
  /**
   * Hệ thống tự gỡ lệnh khóa huấn luyện đang ACTIVE của một con ngựa. Dùng cho module khác gọi trong transaction của họ (vd: F1.8 chuyển nhượng ngựa).
   *
   * - Chuyển lệnh khóa sang RELEASED, releasedAt là thời điểm gọi hàm
   * - releasedBy để null vì hệ thống gỡ, không phải bác sĩ gỡ
   * - releaseConclusion ghi đúng lý do nơi gọi truyền vào (vd: "Gỡ do chuyển nhượng")
   * - Không tự mở transaction và không publish event; nơi gọi truyền manager của transaction đang chạy
   * - Mỗi ngựa chỉ có tối đa một lệnh khóa ACTIVE (unique index training_locks_active_horse_uq), nên nhiều nhất một dòng bị gỡ
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param conclusion Kết luận ghi vào lệnh khóa, nói rõ lý do tự gỡ
   * @returns A promise resolving to true nếu có lệnh khóa ACTIVE được gỡ, false nếu ngựa không có lệnh khóa nào đang hiệu lực
   */
  async releaseActiveLockByHorse(
    manager: EntityManager,
    horseId: string,
    conclusion: string,
  ): Promise<boolean> {
    const result = await manager.getRepository(TrainingLockEntity).update(
      { horseId, status: TrainingLockStatus.ACTIVE },
      {
        status: TrainingLockStatus.RELEASED,
        releasedAt: new Date(),
        releasedBy: null,
        releaseConclusion: conclusion,
      },
    );
    return (result.affected ?? 0) > 0;
  }
}

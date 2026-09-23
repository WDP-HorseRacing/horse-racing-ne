import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';

/**
 * Các query về ngựa mà nhiều feature trong module horses cùng dùng.
 *
 * - Chỉ đọc bảng của module khác (training_locks, groom_assignments, barns, users); việc ghi bảng module khác luôn gọi hàm do module đó export
 * - Không đăng ký entity bằng forFeature: dùng DataSource hoặc manager của transaction nơi gọi, như TrainingAccessService
 */
@Injectable()
export class HorsesSharedRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tìm con ngựa theo id, bỏ qua hồ sơ đã xóa mềm
   *
   * @param id UUID của ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns A promise resolving to con ngựa, hoặc null nếu không có hoặc đã xóa
   */
  findById(id: string, manager?: EntityManager): Promise<HorseEntity | null> {
    return (manager ?? this.dataSource.manager).findOneBy(HorseEntity, { id });
  }

  /**
   * Tìm con ngựa theo id, kể cả hồ sơ đã xóa mềm. Nơi gọi tự quyết định xử lý hồ sơ đã xóa (xem HorseAccessService.findWritableHorse)
   *
   * @param id UUID của ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns A promise resolving to con ngựa (deletedAt khác null nếu đã xóa), hoặc null nếu không có
   */
  findByIdWithDeleted(
    id: string,
    manager?: EntityManager,
  ): Promise<HorseEntity | null> {
    return (manager ?? this.dataSource.manager).findOne(HorseEntity, {
      where: { id },
      withDeleted: true,
    });
  }

  /**
   * Tìm con ngựa kể cả hồ sơ đã xóa và khóa row của nó (pessimistic_write) tới hết transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns A promise resolving to con ngựa đã khóa, hoặc null nếu không có
   */
  lockHorseWithDeleted(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseEntity | null> {
    return manager.findOne(HorseEntity, {
      where: { id: horseId },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Lọc ra những con ngựa đang có lệnh khóa huấn luyện ACTIVE (bảng training_locks của module medical, chỉ đọc)
   *
   * @param horseIds UUID các con ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns A promise resolving to tập UUID các con ngựa đang bị khóa huấn luyện
   */
  async activeTrainingLockHorseIds(
    horseIds: string[],
    manager?: EntityManager,
  ): Promise<Set<string>> {
    if (horseIds.length === 0) return new Set();
    const rows: Array<{ horse_id: string }> = await (
      manager ?? this.dataSource
    ).query(
      `SELECT DISTINCT horse_id FROM training_locks WHERE horse_id = ANY($1) AND status = $2`,
      [horseIds, TrainingLockStatus.ACTIVE],
    );
    return new Set(rows.map((row) => row.horse_id));
  }

  /**
   * Kiểm tra con ngựa có đang bị khóa huấn luyện (lệnh khóa ACTIVE) không
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns A promise resolving to true nếu ngựa đang có lệnh khóa ACTIVE
   */
  async hasActiveTrainingLock(
    horseId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return (await this.activeTrainingLockHorseIds([horseId], manager)).has(
      horseId,
    );
  }

  /**
   * Kiểm tra groom có đang được giao chăm con ngựa không (dòng groom_assignments còn mở, bảng của module stable, chỉ đọc)
   *
   * @param horseId UUID của ngựa
   * @param groomId UUID của groom
   * @param manager EntityManager của transaction đang chạy, bỏ trống khi không ở trong transaction
   * @returns A promise resolving to true nếu groom đang phụ trách con ngựa này
   */
  isGroomAssigned(
    horseId: string,
    groomId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return (manager ?? this.dataSource.manager).existsBy(
      GroomAssignmentEntity,
      { horseId, groomId, endAt: IsNull() },
    );
  }

  /**
   * Kiểm tra con ngựa có đang thuộc một khu do Head Trainer này phụ trách không
   *
   * - Khu của ngựa lấy từ horses.barn_id (Club Manager xếp ở F1.6), không suy ra từ ô chuồng
   * - Ngựa chưa được xếp khu thì không thuộc Head Trainer nào
   * - Hồ sơ đã xóa hoặc khu đã xóa thì coi như không thuộc
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param horseId UUID của ngựa
   * @param trainerId UUID của Head Trainer
   * @returns A promise resolving to true nếu ngựa đang ở một khu có head_trainer_id là trainerId
   */
  async isHorseInTrainerBarn(
    manager: EntityManager,
    horseId: string,
    trainerId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      `SELECT 1
         FROM horses h
         JOIN barns b ON b.id = h.barn_id AND b.deleted_at IS NULL
        WHERE h.id = $1
          AND h.deleted_at IS NULL
          AND b.head_trainer_id = $2
        LIMIT 1`,
      [horseId, trainerId],
    );
    return rows.length > 0;
  }

  /**
   * Lấy giá trị mới nhất của từng loại chỉ số cơ thể của ngựa (bỏ bản ghi đã xóa)
   *
   * @param horseId UUID của ngựa
   * @returns A promise resolving to tối đa một bản ghi cho mỗi loại chỉ số
   */
  latestMeasurements(horseId: string): Promise<HorseMeasurementEntity[]> {
    return this.dataSource
      .getRepository(HorseMeasurementEntity)
      .createQueryBuilder('m')
      .distinctOn(['m.type'])
      .where('m.horseId = :horseId', { horseId })
      .orderBy('m.type', 'ASC')
      .addOrderBy('m.measuredAt', 'DESC')
      .getMany();
  }

  /**
   * Khóa chia sẻ row tài khoản chủ (FOR SHARE) rồi kiểm tài khoản đó có đang là HORSE_OWNER hoạt động không (bảng users, chỉ đọc)
   *
   * - Khóa FOR SHARE chặn module users đổi role hoặc khóa tài khoản này (module đó khóa FOR UPDATE) cho tới hết transaction, nên không có khe gán chủ trong lúc tài khoản đang bị đổi
   * - Chỉ gọi trong transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param ownerId UUID tài khoản cần kiểm
   * @returns A promise resolving to true nếu tài khoản tồn tại, có role HORSE_OWNER và đang ACTIVE
   */
  async lockActiveHorseOwner(
    manager: EntityManager,
    ownerId: string,
  ): Promise<boolean> {
    const owner = await manager.findOne(UserEntity, {
      where: { id: ownerId },
      lock: { mode: 'pessimistic_read' },
    });
    return (
      owner?.role === UserRole.HORSE_OWNER && owner.status === UserStatus.ACTIVE
    );
  }

  /**
   * Lấy tên chủ của ngựa nếu tài khoản đó không còn là HORSE_OWNER hoạt động (dùng cho màn xem trước, chỉ đọc)
   *
   * @param ownerId UUID tài khoản chủ
   * @param manager EntityManager dùng để query, bỏ trống khi không ở trong transaction
   * @returns A promise resolving to tên chủ nếu chủ không còn hợp lệ, null nếu chủ vẫn hợp lệ hoặc không tìm thấy
   */
  async inactiveOwnerName(
    ownerId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const owner = await (manager ?? this.dataSource.manager).findOneBy(
      UserEntity,
      { id: ownerId },
    );
    if (!owner) return null;
    return owner.role === UserRole.HORSE_OWNER &&
      owner.status === UserStatus.ACTIVE
      ? null
      : owner.fullName;
  }
}

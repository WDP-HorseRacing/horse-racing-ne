import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { UserEntity } from '../../users/entities/user.entity';
import type {
  BarnContact,
  HorseBarnContact,
  HorseMedicalContact,
} from '../types/notification.types';

@Injectable()
export class NotificationRecipientsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lấy id mọi người dùng đang ACTIVE (chưa bị xóa mềm) của một vai trò, ví dụ mọi Veterinarian để gửi cảnh báo y tế toàn câu lạc bộ.
   *
   * @param role Vai trò cần lấy
   * @returns A promise resolving to danh sách id người dùng, rỗng nếu không có ai ACTIVE
   */
  async findActiveUserIdsByRole(role: UserRole): Promise<string[]> {
    const rows = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .select('user.id', 'id')
      .where('user.role = :role', { role })
      .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /**
   * Lấy tên ngựa và Head Trainer phụ trách khu hiện tại của ngựa (horses.barn_id → barns.head_trainer_id).
   *
   * - Đọc cả ngựa đã xóa mềm, vì cảnh báo phát sau commit và hồ sơ có thể vừa bị xóa
   * - Khu đã xóa mềm, khu chưa có Head Trainer, hoặc Head Trainer không còn ACTIVE/không còn role HEAD_TRAINER thì headTrainerId là null
   *
   * @param horseId The id of the horse
   * @returns A promise resolving to tên ngựa kèm Head Trainer của khu, hoặc null nếu không tìm thấy ngựa
   */
  async findHorseBarnContact(
    horseId: string,
  ): Promise<HorseBarnContact | null> {
    const row = await this.dataSource
      .getRepository(HorseEntity)
      .createQueryBuilder('horse')
      .withDeleted()
      .leftJoin(
        BarnEntity,
        'barn',
        'barn.id = horse.barnId AND barn.deletedAt IS NULL',
      )
      .leftJoin(
        UserEntity,
        'trainer',
        'trainer.id = barn.headTrainerId AND trainer.deletedAt IS NULL AND trainer.status = :status AND trainer.role = :role',
        { status: UserStatus.ACTIVE, role: UserRole.HEAD_TRAINER },
      )
      .select('horse.name', 'horseName')
      .addSelect('trainer.id', 'headTrainerId')
      .where('horse.id = :horseId', { horseId })
      .getRawOne<{ horseName: string; headTrainerId: string | null }>();
    if (!row) {
      return null;
    }
    return { horseName: row.horseName, headTrainerId: row.headTrainerId };
  }

  /**
   * Lấy tên ngựa, Head Trainer phụ trách khu và chủ ngựa để gửi thông báo y tế (Flow 3 mục III.7).
   *
   * - Đọc cả ngựa đã xóa mềm, vì thông báo phát sau commit
   * - headTrainerId null theo cùng luật với findHorseBarnContact
   * - ownerId null khi ngựa chưa có chủ, hoặc chủ không còn là HORSE_OWNER đang ACTIVE
   *
   * @param horseId The id of the horse
   * @returns A promise resolving to tên ngựa, Head Trainer và chủ, hoặc null nếu không tìm thấy ngựa
   */
  async findHorseMedicalContact(
    horseId: string,
  ): Promise<HorseMedicalContact | null> {
    const row = await this.dataSource
      .getRepository(HorseEntity)
      .createQueryBuilder('horse')
      .withDeleted()
      .leftJoin(
        BarnEntity,
        'barn',
        'barn.id = horse.barnId AND barn.deletedAt IS NULL',
      )
      .leftJoin(
        UserEntity,
        'trainer',
        'trainer.id = barn.headTrainerId AND trainer.deletedAt IS NULL AND trainer.status = :status AND trainer.role = :trainerRole',
        { status: UserStatus.ACTIVE, trainerRole: UserRole.HEAD_TRAINER },
      )
      .leftJoin(
        UserEntity,
        'owner',
        'owner.id = horse.ownerId AND owner.deletedAt IS NULL AND owner.status = :status AND owner.role = :ownerRole',
        { ownerRole: UserRole.HORSE_OWNER },
      )
      .select('horse.name', 'horseName')
      .addSelect('trainer.id', 'headTrainerId')
      .addSelect('owner.id', 'ownerId')
      .where('horse.id = :horseId', { horseId })
      .getRawOne<{
        horseName: string;
        headTrainerId: string | null;
        ownerId: string | null;
      }>();
    if (!row) {
      return null;
    }
    return {
      horseName: row.horseName,
      headTrainerId: row.headTrainerId,
      ownerId: row.ownerId,
    };
  }

  /**
   * Lấy tên khu và Head Trainer đang phụ trách khu đó.
   *
   * - Head Trainer không còn ACTIVE hoặc không còn role HEAD_TRAINER thì headTrainerId là null
   *
   * @param barnId The id of the barn
   * @returns A promise resolving to tên khu kèm Head Trainer, hoặc null nếu khu không tồn tại hay đã xóa mềm
   */
  async findBarnContact(barnId: string): Promise<BarnContact | null> {
    const row = await this.dataSource
      .getRepository(BarnEntity)
      .createQueryBuilder('barn')
      .leftJoin(
        UserEntity,
        'trainer',
        'trainer.id = barn.headTrainerId AND trainer.deletedAt IS NULL AND trainer.status = :status AND trainer.role = :role',
        { status: UserStatus.ACTIVE, role: UserRole.HEAD_TRAINER },
      )
      .select('barn.name', 'barnName')
      .addSelect('trainer.id', 'headTrainerId')
      .where('barn.id = :barnId', { barnId })
      .getRawOne<{ barnName: string; headTrainerId: string | null }>();
    if (!row) {
      return null;
    }
    return { barnName: row.barnName, headTrainerId: row.headTrainerId };
  }

  /**
   * Lấy tên ngựa theo id, đọc cả hồ sơ đã xóa mềm.
   *
   * @param horseId The id of the horse
   * @returns A promise resolving to tên ngựa, hoặc null nếu không tìm thấy
   */
  async findHorseName(horseId: string): Promise<string | null> {
    const horse = await this.dataSource.getRepository(HorseEntity).findOne({
      where: { id: horseId },
      withDeleted: true,
      select: { id: true, name: true },
    });
    return horse?.name ?? null;
  }
}

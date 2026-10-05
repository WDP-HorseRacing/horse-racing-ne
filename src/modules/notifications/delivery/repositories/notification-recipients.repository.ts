import { Injectable } from '@nestjs/common';
import { DataSource, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { UserRole } from '../../../../common/enums/role.enum';
import { UserStatus } from '../../../../common/enums/user-status.enum';
import { HorseEntity } from '../../../horses/entities/horse.entity';
import { BarnEntity } from '../../../stable/entities/barn.entity';
import { UserEntity } from '../../../users/entities/user.entity';
import type {
  BarnContact,
  HorseBarnContact,
  HorseMedicalContact,
} from '../../types/notification.types';

@Injectable()
export class NotificationRecipientsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lấy id mọi người dùng đang ACTIVE (chưa bị xóa mềm) của một vai trò.
   *
   * @param role Vai trò cần lấy
   * @returns Promise trả về danh sách id người dùng, rỗng nếu không có ai ACTIVE
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
   * - Đọc cả ngựa đã xóa mềm
   * - Khu đã xóa mềm, khu chưa có Head Trainer, hoặc Head Trainer không còn ACTIVE/không còn role HEAD_TRAINER thì headTrainerId là null
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về tên ngựa kèm Head Trainer của khu, hoặc null nếu không tìm thấy ngựa
   */
  async findHorseBarnContact(
    horseId: string,
  ): Promise<HorseBarnContact | null> {
    const row = await this.leftJoinActiveHeadTrainer(
      this.horseWithLiveBarn(horseId),
    )
      .select('horse.name', 'horseName')
      .addSelect('trainer.id', 'headTrainerId')
      .getRawOne<{ horseName: string; headTrainerId: string | null }>();
    if (!row) {
      return null;
    }
    return { horseName: row.horseName, headTrainerId: row.headTrainerId };
  }

  /**
   * Lấy tên ngựa, Head Trainer phụ trách khu và chủ ngựa để gửi thông báo y tế.
   *
   * - Đọc cả ngựa đã xóa mềm
   * - headTrainerId null theo cùng luật với findHorseBarnContact
   * - ownerId null khi ngựa chưa có chủ, hoặc chủ không còn là HORSE_OWNER đang ACTIVE
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về tên ngựa, Head Trainer và chủ, hoặc null nếu không tìm thấy ngựa
   */
  async findHorseMedicalContact(
    horseId: string,
  ): Promise<HorseMedicalContact | null> {
    const row = await this.leftJoinActiveHeadTrainer(
      this.horseWithLiveBarn(horseId),
    )
      .leftJoin(
        UserEntity,
        'owner',
        'owner.id = horse.ownerId AND owner.deletedAt IS NULL AND owner.status = :ownerStatus AND owner.role = :ownerRole',
        { ownerStatus: UserStatus.ACTIVE, ownerRole: UserRole.HORSE_OWNER },
      )
      .select('horse.name', 'horseName')
      .addSelect('trainer.id', 'headTrainerId')
      .addSelect('owner.id', 'ownerId')
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
   * @param barnId UUID của khu
   * @returns Promise trả về tên khu kèm Head Trainer, hoặc null nếu khu không tồn tại hay đã xóa mềm
   */
  async findBarnContact(barnId: string): Promise<BarnContact | null> {
    const row = await this.leftJoinActiveHeadTrainer(
      this.dataSource.getRepository(BarnEntity).createQueryBuilder('barn'),
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
   * Tạo query ngựa (kể cả hồ sơ đã xóa mềm) kèm khu hiện tại chưa xóa của nó
   *
   * @param horseId UUID của ngựa
   * @returns Query builder với alias `horse` và `barn`
   */
  private horseWithLiveBarn(horseId: string): SelectQueryBuilder<HorseEntity> {
    return this.dataSource
      .getRepository(HorseEntity)
      .createQueryBuilder('horse')
      .withDeleted()
      .leftJoin(
        BarnEntity,
        'barn',
        'barn.id = horse.barnId AND barn.deletedAt IS NULL',
      )
      .andWhere('horse.id = :horseId', { horseId });
  }

  /**
   * Join Head Trainer đang phụ trách khu vào query, chỉ khi tài khoản chưa xóa, đang ACTIVE và còn vai trò HEAD_TRAINER
   *
   * @param qb Query builder đã có alias `barn`
   * @returns Query builder kèm alias `trainer`
   */
  private leftJoinActiveHeadTrainer<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    return qb.leftJoin(
      UserEntity,
      'trainer',
      'trainer.id = barn.headTrainerId AND trainer.deletedAt IS NULL AND trainer.status = :trainerStatus AND trainer.role = :trainerRole',
      { trainerStatus: UserStatus.ACTIVE, trainerRole: UserRole.HEAD_TRAINER },
    );
  }
}

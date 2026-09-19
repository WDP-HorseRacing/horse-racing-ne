import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseOwnerShareDto } from '../dto/horse.dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { ownerSharesError } from '../policies/horse.policy';

/**
 * Kiểm tra và ghi các dòng sở hữu ngựa. Dùng chung cho tạo ngựa, kích hoạt ngựa tham chiếu, đổi chủ và chuyển nhượng.
 */
@Injectable()
export class HorseOwnersService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Validate the ownership shares and ensure every owner is an active horse owner
   * @param owners The owners with their ownership percentages
   * @returns A promise resolving once the check passes
   * @throws BadRequestException if the shares are invalid or an owner is not an active horse owner
   */
  async validateOwners(owners: HorseOwnerShareDto[]): Promise<void> {
    const sharesError = ownerSharesError(owners);
    if (sharesError) throw new BadRequestException(sharesError);

    const ownerIds = owners.map((owner) => owner.ownerId);
    const found = await this.dataSource.getRepository(UserEntity).find({
      where: {
        id: In(ownerIds),
        role: UserRole.HORSE_OWNER,
        status: UserStatus.ACTIVE,
      },
    });
    if (found.length !== ownerIds.length) {
      throw new BadRequestException(
        'Chủ sở hữu phải là tài khoản HORSE_OWNER đang hoạt động',
      );
    }
  }

  /**
   * Insert open ownerships of a horse within a transaction
   * @param manager The transaction entity manager
   * @param horseId The ID of the horse
   * @param owners The owners with their ownership percentages
   * @param startAt The moment the ownerships start
   * @returns A promise resolving once the ownerships are saved
   */
  async insertOwnerships(
    manager: EntityManager,
    horseId: string,
    owners: HorseOwnerShareDto[],
    startAt: Date,
  ): Promise<void> {
    const ownerships = manager.getRepository(HorseOwnershipEntity);
    await ownerships.save(
      owners.map((owner) =>
        ownerships.create({
          horseId,
          ownerId: owner.ownerId,
          percentage: owner.percentage.toFixed(2),
          startAt,
          endAt: null,
          isRepresentative: owner.isRepresentative ?? false,
        }),
      ),
    );
  }

  /**
   * Close all open ownerships of a horse within a transaction
   * @param manager The transaction entity manager
   * @param horseId The ID of the horse
   * @param endAt The moment the open ownerships end (exclusive)
   * @returns A promise that resolves once the ownerships are closed
   */
  async closeActiveOwnerships(
    manager: EntityManager,
    horseId: string,
    endAt: Date,
  ): Promise<void> {
    await manager
      .getRepository(HorseOwnershipEntity)
      .update({ horseId, endAt: IsNull() }, { endAt });
  }
}

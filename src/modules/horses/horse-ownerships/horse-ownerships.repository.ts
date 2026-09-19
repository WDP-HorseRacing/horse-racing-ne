import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';

@Injectable()
export class HorseOwnershipsRepository {
  constructor(
    @InjectRepository(HorseEntity)
    private readonly horses: Repository<HorseEntity>,
    @InjectRepository(HorseOwnershipEntity)
    private readonly ownerships: Repository<HorseOwnershipEntity>,
  ) {}

  /**
   * List the ownership history of a horse, open ownerships first
   * @param horseId The ID of the horse
   * @returns A promise resolving to the ownerships with their owners
   */
  listOwnershipByHorse(horseId: string): Promise<HorseOwnershipEntity[]> {
    return this.ownerships.find({
      where: { horseId },
      relations: { owner: true },
      order: {
        endAt: { direction: 'DESC', nulls: 'FIRST' },
        startAt: 'DESC',
      },
    });
  }

  /**
   * List horses currently owned by a user
   * @param ownerId The ID of the owner
   * @returns A promise resolving to the horses with an open ownership
   */
  listOwnedBy(ownerId: string): Promise<HorseEntity[]> {
    return this.horses
      .createQueryBuilder('horse')
      .where(
        'EXISTS (SELECT 1 FROM horse_ownerships ho WHERE ho.horse_id = horse.id AND ho.owner_id = :ownerId AND ho.end_at IS NULL)',
        { ownerId },
      )
      .orderBy('horse.name', 'ASC')
      .getMany();
  }

  /**
   * Khóa và lấy các dòng sở hữu đang mở của ngựa trong transaction.
   *
   * @param manager EntityManager của transaction
   * @param horseId UUID của ngựa
   * @returns Các dòng sở hữu có endAt null, đã khóa pessimistic_write
   */
  lockOpenOwnerships(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseOwnershipEntity[]> {
    return manager.getRepository(HorseOwnershipEntity).find({
      where: { horseId, endAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Đóng các dòng sở hữu theo id trong transaction.
   *
   * @param manager EntityManager của transaction
   * @param ids UUID các dòng sở hữu cần đóng
   * @param endAt Thời điểm kết thúc (không tính thời điểm này)
   * @returns Promise hoàn tất khi đã đóng xong
   */
  async closeOwnerships(
    manager: EntityManager,
    ids: string[],
    endAt: Date,
  ): Promise<void> {
    if (ids.length === 0) return;
    await manager
      .getRepository(HorseOwnershipEntity)
      .update({ id: In(ids), endAt: IsNull() }, { endAt });
  }
}

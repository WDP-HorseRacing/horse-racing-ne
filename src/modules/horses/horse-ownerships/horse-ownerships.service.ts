import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  HorseOwnershipResponseDto,
  HorseResponseDto,
  SetHorseOwnersDto,
} from '../dto/horse.dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import {
  toCoOwnerResponse,
  toOwnershipResponse,
} from '../mappers/horse-ownerships.mapper';
import { toHorseResponse } from '../mappers/horse.mapper';
import {
  futureTransferError,
  planOwnershipChange,
  staleTransferError,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnersService } from '../shared/horse-owners.service';

@Injectable()
export class HorseOwnershipsService {
  constructor(
    @InjectRepository(HorseOwnershipEntity)
    private readonly ownerships: Repository<HorseOwnershipEntity>,
    @InjectRepository(HorseEntity)
    private readonly horsesRepository: Repository<HorseEntity>,
    private readonly access: HorseAccessService,
    private readonly owners: HorseOwnersService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy lịch sử sở hữu của con ngựa.
   *
   * - Club Manager thấy toàn bộ lịch sử, đầy đủ thông tin.
   * - Horse Owner thấy đầy đủ các dòng của chính mình (cả dòng đã kết thúc); đồng chủ đang sở hữu chỉ có tên, tỉ lệ và cờ đại diện; không thấy chủ cũ.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Danh sách dòng sở hữu người gọi được xem
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listOwners(
    actor: Actor,
    horseId: string,
  ): Promise<HorseOwnershipResponseDto[]> {
    const caller = await this.access.currentUser(actor);
    await this.access.findReadable(actor, horseId);
    const ownerships = await this.ownerships.find({
      where: { horseId },
      relations: { owner: true },
      order: {
        endAt: { direction: 'DESC', nulls: 'FIRST' },
        startAt: 'DESC',
      },
    });
    if (this.access.hasRole(actor, UserRole.CLUB_MANAGER)) {
      return ownerships.map((ownership) =>
        toOwnershipResponse(ownership, true),
      );
    }
    return ownerships
      .filter(
        (ownership) =>
          ownership.ownerId === caller.id || ownership.endAt === null,
      )
      .map((ownership) =>
        ownership.ownerId === caller.id
          ? toOwnershipResponse(ownership, true)
          : toCoOwnerResponse(ownership),
      );
  }

  /**
   * Đổi chủ hoặc chuyển nhượng ngựa, không sửa trực tiếp dòng sở hữu cũ.
   *
   * - Chủ giữ nguyên tỉ lệ và cờ đại diện: giữ dòng cũ.
   * - Dòng thay đổi hoặc bị bỏ: đóng với endAt = thời điểm chuyển nhượng.
   * - Phần thay đổi hoặc chủ mới: tạo dòng mới với startAt = thời điểm chuyển nhượng.
   * - Không có gì thay đổi thì không ghi.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Bộ chủ mới và thời điểm chuyển nhượng (không gửi thì là hiện tại)
   * @returns Lịch sử sở hữu của ngựa sau khi đổi
   * @throws NotFoundException Nếu không có ngựa
   * @throws BadRequestException Nếu ngựa là ngựa tham chiếu, bộ chủ không hợp lệ, chủ không phải HORSE_OWNER đang hoạt động, hoặc thời điểm chuyển nhượng ở tương lai
   * @throws ConflictException Nếu ngựa đã chuyển nhượng khỏi CLB, hoặc thời điểm chuyển nhượng không sau lần gán chủ gần nhất
   */
  async replaceOwners(
    actor: Actor,
    horseId: string,
    body: SetHorseOwnersDto,
  ): Promise<HorseOwnershipResponseDto[]> {
    await this.access.currentUser(actor);
    const horse = await this.access.findHorse(horseId);
    this.access.assertOperational(horse);
    this.access.assertNotTransferred(horse);

    await this.owners.validateOwners(body.owners);

    const now = new Date();
    const transferredAt = body.transferredAt
      ? new Date(body.transferredAt)
      : now;
    const futureError = futureTransferError(transferredAt, now);
    if (futureError) throw new BadRequestException(futureError);

    await this.dataSource.transaction(async (manager) => {
      await this.access.currentUser(actor, manager);
      const lockedHorse = await manager.getRepository(HorseEntity).findOne({
        where: { id: horseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedHorse) throw new NotFoundException('Không tìm thấy ngựa');
      this.access.assertOperational(lockedHorse);
      this.access.assertNotTransferred(lockedHorse);

      const ownershipRepository = manager.getRepository(HorseOwnershipEntity);
      const openRows = await ownershipRepository.find({
        where: { horseId, endAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      const staleError = staleTransferError(
        transferredAt,
        latestStartAt(openRows),
      );
      if (staleError) throw new ConflictException(staleError);

      const plan = planOwnershipChange(openRows, body.owners);
      if (plan.closeIds.length > 0) {
        await ownershipRepository.update(
          { id: In(plan.closeIds), endAt: IsNull() },
          { endAt: transferredAt },
        );
      }
      if (plan.inserts.length > 0) {
        await this.owners.insertOwnerships(
          manager,
          horseId,
          plan.inserts,
          transferredAt,
        );
      }
    });

    return this.listOwners(actor, horseId);
  }

  /**
   * List the horses currently owned by the caller
   * @param actor The actor resolved from the JWT
   * @returns A promise resolving to the caller's horses
   */
  async listMyHorses(actor: Actor): Promise<HorseResponseDto[]> {
    const caller = await this.access.currentUser(actor);
    const horses = await this.horsesRepository
      .createQueryBuilder('horse')
      .where(
        `EXISTS (
          SELECT 1 FROM horse_ownerships ho
          WHERE ho.horse_id = horse.id
          AND ho.owner_id = :ownerId
          AND ho.end_at IS NULL
        )`,
        { ownerId: caller.id },
      )
      .orderBy('horse.name', 'ASC')
      .getMany();
    return horses.map(toHorseResponse);
  }
}

/**
 * Lấy startAt lớn nhất trong các dòng sở hữu đang mở.
 *
 * @param rows Các dòng sở hữu đang mở
 * @returns startAt lớn nhất, hoặc null nếu không có dòng nào
 */
function latestStartAt(rows: HorseOwnershipEntity[]): Date | null {
  return rows.reduce<Date | null>(
    (latest, row) =>
      !latest || row.startAt.getTime() > latest.getTime()
        ? row.startAt
        : latest,
    null,
  );
}

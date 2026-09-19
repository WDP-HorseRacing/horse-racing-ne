import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
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
  toHorseResponse,
  toOwnershipResponse,
} from '../mappers/horse.mapper';
import {
  futureTransferError,
  planOwnershipChange,
  staleTransferError,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnersService } from '../shared/horse-owners.service';
import { HorseOwnershipsRepository } from './horse-ownerships.repository';

@Injectable()
export class HorseOwnershipsService {
  constructor(
    private readonly ownerships: HorseOwnershipsRepository,
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
    const ownerships = await this.ownerships.listOwnershipByHorse(horseId);
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
      await manager.getRepository(HorseEntity).findOne({
        where: { id: horseId },
        lock: { mode: 'pessimistic_write' },
      });
      const openRows = await this.ownerships.lockOpenOwnerships(
        manager,
        horseId,
      );
      const staleError = staleTransferError(
        transferredAt,
        latestStartAt(openRows),
      );
      if (staleError) throw new ConflictException(staleError);

      const plan = planOwnershipChange(openRows, body.owners);
      await this.ownerships.closeOwnerships(
        manager,
        plan.closeIds,
        transferredAt,
      );
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
    const horses = await this.ownerships.listOwnedBy(caller.id);
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

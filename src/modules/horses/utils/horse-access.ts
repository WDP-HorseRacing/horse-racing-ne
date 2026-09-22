import { NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';

/**
 * Tìm con ngựa mà người gọi được xem dữ liệu. Dùng chung cho mọi module hiển thị dữ liệu của một con ngựa.
 *
 * - Club Manager: xem được cả hồ sơ đã xóa và ngựa tham chiếu.
 * - Head Trainer, Veterinarian, Groom: mọi ngựa trong CLB, trừ hồ sơ đã xóa và ngựa tham chiếu.
 * - Horse Owner: chỉ ngựa đang sở hữu.
 *
 * @param manager EntityManager dùng để query
 * @param actor Thông tin danh tính từ Access Token
 * @param callerId UUID của người gọi
 * @param horseId UUID của ngựa
 * @returns HorseEntity - Con ngựa người gọi được xem
 * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi (báo 'không tìm thấy' để không lộ là ngựa có tồn tại)
 */
export async function findReadableHorse(
  manager: EntityManager,
  actor: Actor,
  callerId: string,
  horseId: string,
): Promise<HorseEntity> {
  const isManager = actor.roles.includes(UserRole.CLUB_MANAGER);
  const horse = await manager.findOne(HorseEntity, {
    where: { id: horseId },
    withDeleted: isManager,
  });
  if (!horse || (horse.isReference && !isManager)) {
    throw new NotFoundException('Không tìm thấy ngựa');
  }
  if (
    actor.roles.includes(UserRole.HORSE_OWNER) &&
    !(await ownsHorse(manager, horseId, callerId))
  ) {
    throw new NotFoundException('Không tìm thấy ngựa');
  }
  return horse;
}

/**
 * Kiểm tra người dùng có đang sở hữu một phần con ngựa không.
 *
 * @param manager EntityManager dùng để query
 * @param horseId UUID của ngựa
 * @param ownerId UUID của người dùng
 * @returns true nếu còn dòng sở hữu đang mở (end_at IS NULL)
 */
function ownsHorse(
  manager: EntityManager,
  horseId: string,
  ownerId: string,
): Promise<boolean> {
  return manager.existsBy(HorseOwnershipEntity, {
    horseId,
    ownerId,
    endAt: IsNull(),
  });
}

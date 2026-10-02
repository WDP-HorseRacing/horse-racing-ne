import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import type { CurrentActorUser } from '../../users/utils/current-user';

@Injectable()
export class MedicalAccessService {
  constructor(private readonly horseAccess: HorseAccessService) {}

  /**
   * Khóa row con ngựa trước mọi thao tác ghi y tế trong transaction
   *
   * - Kiểm tài khoản đang ACTIVE, ngựa tồn tại, chưa xóa và nằm trong phạm vi xem
   * - Chặn ngựa đã chuyển nhượng (hồ sơ chỉ đọc)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to user hiện tại và con ngựa đã khóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu Club Manager thao tác hồ sơ đã xóa, hoặc ngựa đã chuyển nhượng
   */
  async lockHorseForWrite(
    manager: EntityManager,
    actor: Actor,
    horseId: string,
  ): Promise<{ caller: CurrentActorUser; horse: HorseEntity }> {
    const locked = await this.horseAccess.lockWritableHorseInScope(
      manager,
      actor,
      horseId,
    );
    this.horseAccess.assertNotTransferred(locked.horse);
    return locked;
  }
}

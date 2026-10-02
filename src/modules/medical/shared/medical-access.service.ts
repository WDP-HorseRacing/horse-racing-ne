import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { assertNotTransferred } from '../../horses/policies/horse.policy';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import type { CurrentActorUser } from '../../users/utils/current-user';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { MedicalCaseEntity } from '../entities/medical-case.entity';

@Injectable()
export class MedicalAccessService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    private readonly dataSource: DataSource,
  ) {}

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
    assertNotTransferred(locked.horse);
    return locked;
  }

  /**
   * Tìm bệnh án đang mở của con ngựa, mỗi ngựa tối đa một
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns Promise trả về bệnh án đang mở, null nếu không có
   */
  findOpenCase(
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<MedicalCaseEntity | null> {
    return manager.findOne(MedicalCaseEntity, {
      where: { horseId, status: MedicalCaseStatus.OPEN },
    });
  }
}

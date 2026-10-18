import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { assertLifecycleWritable } from '../../horses/policies/horse.policy';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import type { CurrentActorUser } from '../../users/utils/current-user';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import type { ExposedHorse } from '../types/medical-events.types';

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
   * - Chặn ngựa đã chuyển nhượng hoặc đã mất (hồ sơ chỉ đọc)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về user hiện tại và con ngựa đã khóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu Club Manager thao tác hồ sơ đã xóa, hoặc ngựa đã chuyển nhượng hoặc đã mất
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
    assertLifecycleWritable(locked.horse);
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

  /**
   * Liệt kê ngựa có thể đã tiếp xúc với một con ngựa, theo hiện trạng lúc gọi
   *
   * - Cùng khu: ngựa đang ở cùng khu với con ngựa này
   * - Cùng Groom: ngựa đang do Groom phụ trách con ngựa này chăm
   * - Bỏ chính con ngựa đó; chỉ lấy ngựa chưa xóa, đang ACTIVE hoặc RETIRED
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise trả về các con ngựa có thể đã tiếp xúc, theo tên
   */
  exposedHorses(
    manager: EntityManager,
    horseId: string,
  ): Promise<ExposedHorse[]> {
    return manager.query(
      `WITH target AS (
              SELECT h.barn_id,
                     (SELECT ga.groom_id
                        FROM groom_assignments ga
                       WHERE ga.horse_id = h.id AND ga.end_at IS NULL) AS groom_id
                FROM horses h
               WHERE h.id = $1
       )
       SELECT h.id AS "horseId",
              h.name AS "horseName",
              COALESCE(h.barn_id = t.barn_id, false) AS "sameBarn",
              (ga.id IS NOT NULL) AS "sameGroom"
         FROM target t
         JOIN horses h ON h.id <> $1
         LEFT JOIN groom_assignments ga
                ON ga.horse_id = h.id
               AND ga.end_at IS NULL
               AND ga.groom_id = t.groom_id
        WHERE h.deleted_at IS NULL
          AND h.lifecycle_status IN ($2, $3)
          AND (h.barn_id = t.barn_id OR ga.id IS NOT NULL)
        ORDER BY h.name, h.id`,
      [horseId, HorseLifecycleStatus.ACTIVE, HorseLifecycleStatus.RETIRED],
    );
  }
}

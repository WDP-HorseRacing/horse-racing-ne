import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { DEFAULT_THRESHOLD_LIMITS } from '../constants/performance.constants';
import { HorseThresholdsResponseDto } from '../dto/horse-thresholds.dto';
import { toHorseThresholdsResponse } from '../mappers/performance-threshold.mapper';

/**
 * Xem ngưỡng nhịp tim/tốc độ đang áp cho từng con ngựa
 */
@Injectable()
export class PerformanceThresholdsService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy ngưỡng đang áp cho con ngựa, là ngưỡng chung của CLB
   *
   * - Head Trainer chỉ xem được ngựa thuộc khu mình phụ trách
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về UUID ngựa kèm bộ ngưỡng đang áp
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc Head Trainer xem ngựa ngoài khu
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem
   */
  async list(
    actor: Actor,
    horseId: string,
  ): Promise<HorseThresholdsResponseDto> {
    const manager = this.dataSource.manager;
    const caller = await this.horseAccess.currentUser(actor, manager);
    await this.horseAccess.findReadableHorse(
      manager,
      actor,
      caller.id,
      horseId,
    );
    await this.horseAccess.assertTrainerBarn(
      manager,
      actor,
      caller.id,
      horseId,
    );
    return toHorseThresholdsResponse(horseId, DEFAULT_THRESHOLD_LIMITS);
  }
}

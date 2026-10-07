import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  IsNull,
  LessThanOrEqual,
  MoreThan,
} from 'typeorm';
import { DEFAULT_THRESHOLD_LIMITS } from '../constants/performance.constants';
import { PerformanceThresholdEntity } from '../entities/performance-threshold.entity';
import { ThresholdSource } from '../enums/threshold-source.enum';
import type { ActiveThreshold } from '../types/performance.types';

/**
 * Các câu đọc dùng chung giữa các feature của domain hiệu suất
 */
@Injectable()
export class PerformanceAccessService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lấy bộ ngưỡng đang áp cho con ngựa tại một thời điểm
   *
   * - Có phiên bản riêng hiệu lực tại thời điểm đó (bắt đầu <= at, chưa hết hạn): lấy phiên bản lớn nhất
   * - Không có: dùng ngưỡng mặc định của CLB
   *
   * @param horseId UUID của ngựa
   * @param at Thời điểm cần xét
   * @param manager EntityManager dùng để query, mặc định dùng manager ngoài transaction
   * @returns Promise trả về bộ ngưỡng đang áp và nguồn của nó
   */
  async activeThreshold(
    horseId: string,
    at: Date,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ActiveThreshold> {
    const profile = await manager.findOne(PerformanceThresholdEntity, {
      where: [
        { horseId, effectiveFrom: LessThanOrEqual(at), effectiveTo: IsNull() },
        {
          horseId,
          effectiveFrom: LessThanOrEqual(at),
          effectiveTo: MoreThan(at),
        },
      ],
      order: { ruleVersion: 'DESC' },
    });
    if (!profile) {
      return {
        source: ThresholdSource.CLUB_DEFAULT,
        limits: DEFAULT_THRESHOLD_LIMITS,
      };
    }
    return {
      source: ThresholdSource.HORSE,
      limits: profile.limits,
      profileId: profile.id,
    };
  }
}

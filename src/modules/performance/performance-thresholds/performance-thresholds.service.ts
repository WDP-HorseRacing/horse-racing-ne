import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { assertLifecycleWritable } from '../../horses/policies/horse.policy';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  HorseThresholdsResponseDto,
  ThresholdProfileResponseDto,
  UpsertThresholdDto,
} from '../dto/upsert-threshold.dto';
import { PerformanceThresholdEntity } from '../entities/performance-threshold.entity';
import {
  toHorseThresholdsResponse,
  toThresholdProfileResponse,
} from '../mappers/performance-threshold.mapper';
import { assertThresholdProfile } from '../policies/performance.policy';
import { PerformanceAccessService } from '../shared/performance-access.service';

/**
 * Xem và đặt ngưỡng nhịp tim/tốc độ riêng cho từng con ngựa
 */
@Injectable()
export class PerformanceThresholdsService {
  constructor(
    @InjectRepository(PerformanceThresholdEntity)
    private readonly thresholds: Repository<PerformanceThresholdEntity>,
    private readonly horseAccess: HorseAccessService,
    private readonly performanceAccess: PerformanceAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy ngưỡng đang áp và lịch sử phiên bản ngưỡng của con ngựa
   *
   * - Head Trainer chỉ xem được ngựa thuộc khu mình phụ trách
   * - Ngựa chưa có phiên bản riêng đang hiệu lực: ngưỡng đang áp là mặc định CLB
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về ngưỡng đang áp kèm nguồn và các phiên bản, mới nhất đứng đầu
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
    const profiles = await this.thresholds.find({
      where: { horseId },
      order: { ruleVersion: 'DESC' },
    });
    const active = await this.performanceAccess.activeThreshold(
      horseId,
      new Date(),
    );
    return toHorseThresholdsResponse(active, profiles);
  }

  /**
   * Tạo phiên bản ngưỡng mới cho con ngựa, phiên bản cũ giữ nguyên làm lịch sử
   *
   * - Số phiên bản bằng phiên bản lớn nhất hiện có của ngựa cộng 1
   * - Chỉ Head Trainer, và chỉ cho ngựa thuộc khu mình phụ trách
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Tên, khoảng hiệu lực và bộ ngưỡng
   * @returns Promise trả về phiên bản ngưỡng vừa tạo
   * @throws ForbiddenException Nếu người gọi không phải Head Trainer, tài khoản không hoạt động, hoặc ngựa ngoài khu mình phụ trách
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất
   * @throws BadRequestException Nếu ngưỡng cảnh báo nhịp tim không nhỏ hơn ngưỡng nguy hiểm, hoặc khoảng hiệu lực sai
   */
  async upsert(
    actor: Actor,
    horseId: string,
    body: UpsertThresholdDto,
  ): Promise<ThresholdProfileResponseDto> {
    if (!actor.roles.includes(UserRole.HEAD_TRAINER)) {
      throw new ForbiddenException(
        'Chỉ Head Trainer phụ trách khu được đặt ngưỡng',
      );
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.horseAccess.lockWritableHorseInScope(
        manager,
        actor,
        horseId,
      );
      await this.horseAccess.assertTrainerBarn(
        manager,
        actor,
        caller.id,
        horse.id,
      );
      assertLifecycleWritable(horse);
      const effectiveFrom = new Date(body.effectiveFrom);
      const effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
      assertThresholdProfile(body.limits, effectiveFrom, effectiveTo);
      const latest = await manager.findOne(PerformanceThresholdEntity, {
        where: { horseId: horse.id },
        order: { ruleVersion: 'DESC' },
      });
      return manager.save(
        manager.create(PerformanceThresholdEntity, {
          horseId: horse.id,
          profileName: body.profileName,
          ruleVersion: (latest?.ruleVersion ?? 0) + 1,
          effectiveFrom,
          effectiveTo,
          limits: {
            heartRateWarningBpm: body.limits.heartRateWarningBpm,
            heartRateCriticalBpm: body.limits.heartRateCriticalBpm,
            maxSpeedMps: body.limits.maxSpeedMps,
          },
        }),
      );
    });
    return toThresholdProfileResponse(saved);
  }
}

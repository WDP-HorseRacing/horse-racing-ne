import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { findReadableHorse } from '../../horses/utils/horse-access';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  HorsePerformanceResponseDto,
  SessionPerformanceSummaryDto,
} from '../dto/horse-performance.response.dto';
import {
  toHorsePerformanceResponse,
  toSessionPerformanceSummary,
} from '../mappers/performance.mapper';
import { PerformanceRepository } from '../repositories/performance.repository';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly performanceRepository: PerformanceRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy tổng quan chỉ số của con ngựa cho nhân viên, gồm cả các điểm đo thô gần nhất.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns HorsePerformanceResponseDto - Tổng quan chỉ số
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getHorseSummary(
    actor: Actor,
    horseId: string,
  ): Promise<HorsePerformanceResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await findReadableHorse(this.dataSource.manager, actor, caller.id, horseId);
    const metrics = await this.performanceRepository.listMetrics(horseId);
    const evaluations =
      await this.performanceRepository.listEvaluations(horseId);
    return toHorsePerformanceResponse(horseId, metrics, evaluations);
  }

  /**
   * Lấy chỉ số tổng hợp theo từng buổi tập của con ngựa, không kèm điểm đo thô.
   * Horse Owner chỉ được dùng API này cho mục chỉ số huấn luyện.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Mỗi buổi tập một dòng tổng hợp, buổi mới nhất đứng đầu
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listSessionSummaries(
    actor: Actor,
    horseId: string,
  ): Promise<SessionPerformanceSummaryDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await findReadableHorse(this.dataSource.manager, actor, caller.id, horseId);
    const rows = await this.performanceRepository.sessionSummaries(horseId);
    return rows.map(toSessionPerformanceSummary);
  }
}

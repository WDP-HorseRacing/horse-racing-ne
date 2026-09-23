import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { EvaluationsService } from '../../training/trainging-evaluations/training-evaluations.service';
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
    private readonly horseAccess: HorseAccessService,
    private readonly evaluations: EvaluationsService,
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
    await this.horseAccess.findReadable(actor, horseId);
    const metrics = await this.performanceRepository.listMetrics(horseId);
    const evaluations = await this.evaluations.listLatestByHorse(horseId);
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
    await this.horseAccess.findReadable(actor, horseId);
    const rows = await this.performanceRepository.sessionSummaries(horseId);
    return rows.map(toSessionPerformanceSummary);
  }
}

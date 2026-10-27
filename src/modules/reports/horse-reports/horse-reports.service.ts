import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { clubToday } from '../../../common/utils/club-date';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  HorseHealthResponseDto,
  HorseProgressResponseDto,
} from '../dto/horse-report.dto';
import { ReportPeriodDto } from '../dto/report-period.dto';
import { toHorseHealth, toHorseProgress } from '../mappers/horse-report.mapper';
import { ReportsAccessService } from '../shared/reports-access.service';
import { resolveReportPeriod } from '../utils/report-period';
import { HorseReportsRepository } from './horse-reports.repository';

/**
 * Báo cáo tiến độ tập luyện và lịch sử sức khỏe của một con ngựa
 */
@Injectable()
export class HorseReportsService {
  constructor(
    private readonly repository: HorseReportsRepository,
    private readonly horseAccess: HorseAccessService,
    private readonly reportsAccess: ReportsAccessService,
  ) {}

  /**
   * Dựng báo cáo tiến độ tập luyện của ngựa trong một khoảng ngày
   *
   * - Khoảng ngày theo lịch CLB, mặc định 30 ngày tính tới hôm nay
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Khoảng ngày
   * @returns Promise trả về tổng kỳ, biểu đồ tuần và từng lượt tập
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws BadRequestException Nếu ngày bắt đầu sau ngày kết thúc
   */
  async progress(
    actor: Actor,
    horseId: string,
    query: ReportPeriodDto,
  ): Promise<HorseProgressResponseDto> {
    const horse = await this.horseAccess.findReadableHorseForActor(
      actor,
      horseId,
    );
    const period = resolveReportPeriod(query, clubToday());
    const [rows, metricsByParticipant, metricsByWeek] = await Promise.all([
      this.repository.participants(horse.id, period),
      this.reportsAccess.groupMetrics([horse.id], period, 'PARTICIPANT'),
      this.reportsAccess.groupMetrics([horse.id], period, 'WEEK'),
    ]);
    return toHorseProgress(
      horse,
      period,
      rows,
      metricsByParticipant,
      metricsByWeek,
    );
  }

  /**
   * Dựng báo cáo lịch sử sức khỏe của ngựa trong một khoảng ngày
   *
   * - Khoảng ngày theo lịch CLB, mặc định 30 ngày tính tới hôm nay
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Khoảng ngày
   * @returns Promise trả về trạng thái hiện tại, đổi trạng thái, số đo, ca bệnh, chấn thương và khóa huấn luyện
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws BadRequestException Nếu ngày bắt đầu sau ngày kết thúc
   */
  async health(
    actor: Actor,
    horseId: string,
    query: ReportPeriodDto,
  ): Promise<HorseHealthResponseDto> {
    const horse = await this.horseAccess.findReadableHorseForActor(
      actor,
      horseId,
    );
    const period = resolveReportPeriod(query, clubToday());
    return toHorseHealth(
      horse,
      period,
      await this.repository.health(horse.id, period),
    );
  }
}

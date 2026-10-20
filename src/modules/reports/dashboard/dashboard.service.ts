import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { clubToday } from '../../../common/utils/club-date';
import { currentUserForActor } from '../../users/utils/current-user';
import { DashboardQueryDto, DashboardResponseDto } from '../dto/dashboard.dto';
import { toDashboard } from '../mappers/dashboard.mapper';
import { ReportsAccessService } from '../shared/reports-access.service';
import { resolveReportPeriod } from '../utils/report-period';
import { DashboardRepository } from './dashboard.repository';

/**
 * Dashboard tiến độ và thể lực của ngựa trong CLB
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly reportsAccess: ReportsAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Dựng dashboard của một khoảng ngày
   *
   * - Đàn ngựa: ngựa đang hoạt động trong phạm vi
   * - Tập luyện, biểu đồ tuần, bảng từng ngựa: thêm ngựa không còn hoạt động có lượt tập trong kỳ
   * - Mặc định toàn CLB; barnId: chỉ một khu; mine: chỉ các khu người gọi phụ trách
   * - Khoảng ngày theo lịch CLB, mặc định 30 ngày tính tới hôm nay
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Khoảng ngày và bộ lọc khu
   * @returns Promise trả về đàn ngựa, số liệu tập luyện, biểu đồ tuần và bảng từng ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws BadRequestException Nếu ngày bắt đầu sau ngày kết thúc
   */
  async get(
    actor: Actor,
    query: DashboardQueryDto,
  ): Promise<DashboardResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const period = resolveReportPeriod(query, clubToday());
    const horses = await this.repository.horses(
      {
        barnId: query.barnId,
        headTrainerId: query.mine ? caller.id : undefined,
      },
      period,
    );
    const horseIds = horses.map((horse) => horse.horseId);
    const [participantCounts, sessions, metricsByHorse, metricsByWeek] =
      await Promise.all([
        this.repository.participantCounts(horseIds, period),
        this.repository.sessionCount(horseIds, period),
        this.reportsAccess.groupMetrics(horseIds, period, 'HORSE'),
        this.reportsAccess.groupMetrics(horseIds, period, 'WEEK'),
      ]);
    return toDashboard({
      period,
      horses,
      participantCounts,
      sessions,
      metricsByHorse,
      metricsByWeek,
    });
  }
}

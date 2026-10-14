import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import { toClubDate } from '../../../common/utils/club-date';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  ClubFinanceResponseDto,
  OwnerCostQueryDto,
  OwnerCostResponseDto,
} from '../dto/finance-report.dto';
import { ReportPeriodDto } from '../dto/report-period.dto';
import { toClubFinance, toOwnerCost } from '../mappers/finance-report.mapper';
import { resolveReportPeriod } from '../utils/report-period';
import { FinanceReportsRepository } from './finance-reports.repository';

/**
 * Báo cáo tài chính CLB và chi phí của chủ ngựa
 */
@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly repository: FinanceReportsRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Dựng báo cáo tài chính CLB của một khoảng ngày
   *
   * - Khoảng ngày theo lịch CLB, mặc định 30 ngày tính tới hôm nay
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Khoảng ngày
   * @returns Promise trả về khoản thu từ chủ ngựa, giá trị vật tư, tiền thưởng và bảng từng chủ
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws BadRequestException Nếu ngày bắt đầu sau ngày kết thúc
   */
  async clubFinance(
    actor: Actor,
    query: ReportPeriodDto,
  ): Promise<ClubFinanceResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const asOf = new Date();
    const period = resolveReportPeriod(query, toClubDate(asOf));
    const [dailyFees, medicalCharges, supplies] = await Promise.all([
      this.repository.dailyFees(period, asOf),
      this.repository.medicalCharges(period),
      this.repository.supplyValues(period),
    ]);
    return toClubFinance({ period, dailyFees, medicalCharges }, supplies);
  }

  /**
   * Dựng báo cáo chi phí của một chủ ngựa trong một khoảng ngày
   *
   * - Horse Owner: luôn là báo cáo của chính mình, bỏ qua ownerId
   * - Club Manager: xem của chủ có id ownerId
   * - Khoảng ngày theo lịch CLB, mặc định 30 ngày tính tới hôm nay
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Khoảng ngày và chủ cần xem
   * @returns Promise trả về tổng phí nuôi, chi phí y tế, tiền thưởng và từng con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws BadRequestException Nếu ngày bắt đầu sau ngày kết thúc, hoặc Club Manager không truyền ownerId
   * @throws NotFoundException Nếu không có tài khoản có id ownerId
   */
  async ownerCost(
    actor: Actor,
    query: OwnerCostQueryDto,
  ): Promise<OwnerCostResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const asOf = new Date();
    const period = resolveReportPeriod(query, toClubDate(asOf));
    const owner =
      caller.role === UserRole.HORSE_OWNER
        ? caller
        : await this.findOwner(query.ownerId);
    const [dailyFees, medicalCharges] = await Promise.all([
      this.repository.dailyFees(period, asOf, owner.id),
      this.repository.medicalCharges(period, owner.id),
    ]);
    return toOwnerCost(owner, {
      period,
      dailyFees,
      medicalCharges,
    });
  }

  /**
   * Tìm tài khoản chủ ngựa mà Club Manager muốn xem báo cáo
   *
   * - Gồm cả tài khoản đã khóa, đã xóa hoặc đã đổi vai trò
   *
   * @param ownerId UUID tài khoản chủ ngựa
   * @returns Promise trả về tài khoản
   * @throws BadRequestException Nếu không truyền ownerId
   * @throws NotFoundException Nếu không có tài khoản có id ownerId
   */
  private async findOwner(ownerId: string | undefined): Promise<UserEntity> {
    if (!ownerId) throw fieldBadRequest('ownerId', 'Phải chọn chủ ngựa');
    const owner = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: ownerId },
      withDeleted: true,
    });
    if (!owner) throw new NotFoundException('Không tìm thấy chủ ngựa');
    return owner;
  }
}

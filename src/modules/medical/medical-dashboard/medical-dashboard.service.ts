import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { CheckupDueStatus } from '../constants/checkup.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { CHECKUP_DUE_SOON_DAYS } from '../constants/medical.constants';
import {
  HerdCountsDto,
  MedicalDashboardQueryDto,
  MedicalDashboardResponseDto,
} from '../dto';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { toExamRequestResponse } from '../mappers/medical.mapper';
import {
  addDays,
  healthPriority,
  toClubDate,
} from '../policies/medical.policy';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { MedicalDashboardRepository } from './medical-dashboard.repository';

@Injectable()
export class MedicalDashboardService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    private readonly checkups: MedicalCheckupsService,
    private readonly dashboard: MedicalDashboardRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Bảng điều khiển y tế gồm bốn khối, tính trực tiếp mỗi lần mở, không có chi phí (F3.1)
   *
   * - Sơ đồ đàn: đếm theo trạng thái sức khỏe, mỗi con kèm khu và ô chuồng để vẽ theo chuồng trại, Cách ly và Chấn thương lên đầu
   * - Yêu cầu khám đọc qua DataSource vì bảng thuộc feature exam-requests
   * - Lịch khám: các con quá hạn và đến hạn trong 3 ngày tới; kèm lịch tiêm phòng, tẩy giun, kiểm tra móng quá hạn hoặc đến hạn trong 3 ngày tới (F3.11 mục 5)
   * - Bệnh án đang mở kèm buổi khám gần nhất và ngày hẹn tái khám
   * - Yêu cầu khám đang chờ, Khẩn lên trước
   * - Không tính ngựa đã chuyển nhượng và hồ sơ đã xóa; bộ lọc khu và trạng thái sức khỏe áp cho cả bốn khối
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Lọc theo khu và trạng thái sức khỏe
   * @returns A promise resolving to bốn khối thông tin y tế
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  async get(
    actor: Actor,
    query: MedicalDashboardQueryDto,
  ): Promise<MedicalDashboardResponseDto> {
    await this.horseAccess.currentUser(actor);
    const filter = { barnId: query.barnId, healthStatus: query.healthStatus };
    const today = toClubDate(new Date());
    const rows = await this.checkups.herdCheckupAnchors(filter);
    const horseIds = rows.map((row) => row.horseId);
    const [checkups, careSchedules, openCases, pending] = await Promise.all([
      this.checkups.checkupItemsFor(rows, today),
      horseIds.length
        ? this.checkups.dueCareSchedules(
            addDays(today, CHECKUP_DUE_SOON_DAYS),
            horseIds,
          )
        : Promise.resolve([]),
      this.dashboard.openCases(horseIds),
      horseIds.length
        ? this.dataSource.manager.find(MedicalExamRequestEntity, {
            where: {
              horseId: In(horseIds),
              status: ExamRequestStatus.PENDING,
            },
            relations: { horse: true },
            order: { urgent: 'DESC', createdAt: 'ASC' },
          })
        : Promise.resolve([]),
    ]);

    const counts: HerdCountsDto = {
      QUARANTINED: 0,
      INJURED: 0,
      UNDER_OBSERVATION: 0,
      ELIGIBLE: 0,
    };
    for (const row of rows) counts[row.healthStatus] += 1;
    const horses = rows
      .map((row) => ({
        horseId: row.horseId,
        horseName: row.horseName,
        barnId: row.barnId,
        stallId: row.stallId,
        stallCode: row.stallCode,
        healthStatus: row.healthStatus,
      }))
      .sort(
        (a, b) =>
          healthPriority(a.healthStatus) - healthPriority(b.healthStatus) ||
          a.horseName.localeCompare(b.horseName, 'vi'),
      );

    return {
      herd: { counts, horses },
      checkups: checkups.filter(
        (item) => item.dueStatus !== CheckupDueStatus.OK,
      ),
      careSchedules,
      openCases,
      pendingRequests: pending.map(toExamRequestResponse),
    };
  }
}

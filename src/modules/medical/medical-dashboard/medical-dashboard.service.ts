import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { StableAccessService } from '../../stable/shared/stable-access.service';
import { CheckupDueStatus } from '../constants/checkup.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { CHECKUP_DUE_SOON_DAYS } from '../constants/medical.constants';
import { MedicalDashboardQueryDto, MedicalDashboardResponseDto } from '../dto';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import {
  toExamRequestResponse,
  toHerdBlock,
  toHorsesWithoutCase,
} from '../mappers/medical.mapper';
import { addDays } from '../policies/medical.policy';
import { toClubDate } from '../../../common/utils/club-date';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import type { HerdFilter } from '../types/medical-checkup.types';
import { MedicalDashboardRepository } from './medical-dashboard.repository';

@Injectable()
export class MedicalDashboardService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    private readonly checkups: MedicalCheckupsService,
    private readonly dashboard: MedicalDashboardRepository,
    private readonly dataSource: DataSource,
    private readonly stableAccess: StableAccessService,
  ) {}

  /**
   * Bảng điều khiển y tế gồm bảy khối, tính trực tiếp mỗi lần mở, không có chi phí
   *
   * - Sơ đồ đàn: đếm theo trạng thái sức khỏe trên cả đàn thuộc phạm vi khu (không bị lọc theo trạng thái sức khỏe); danh sách mỗi con kèm khu và ô chuồng để vẽ theo chuồng trại, Cách ly và Chấn thương lên đầu
   * - Lịch khám: các con Quá hạn và Đến hạn; kèm lịch tiêm phòng, tẩy giun, kiểm tra móng quá hạn hoặc đến hạn trong CHECKUP_DUE_SOON_DAYS ngày tới
   * - Bệnh án đang mở kèm buổi khám gần nhất và ngày hẹn tái khám
   * - Ngựa Chấn thương hoặc Cách ly chưa có bệnh án đang mở, kèm thời điểm chuyển sang trạng thái đó; Cách ly lên trước, rồi lâu nhất lên trước
   * - Yêu cầu khám đang chờ, Khẩn lên trước
   * - Thuốc cần cho hôm nay: đơn thuốc đang hiệu lực theo ngày lịch câu lạc bộ, kèm liều và tần suất
   * - Không tính ngựa đã chuyển nhượng và hồ sơ đã xóa; bộ lọc khu áp cho mọi khối; bộ lọc trạng thái sức khỏe áp cho danh sách ngựa của sơ đồ đàn và các khối còn lại, không áp cho số đếm
   * - Mặc định cả CLB cho mọi vai trò được xem; barnId: chỉ một khu; mine = true: chỉ các khu người gọi phụ trách; đi cùng nhau thì lấy phần giao (khu không do người gọi phụ trách thì đàn rỗng)
   * - careAssignee = me: khối lịch tiêm phòng, tẩy giun, kiểm tra móng chỉ giữ lịch có người làm hiện tại là người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Lọc theo khu, khu mình phụ trách, trạng thái sức khỏe và người làm lịch chăm sóc
   * @returns Promise trả về bảy khối thông tin y tế
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  async get(
    actor: Actor,
    query: MedicalDashboardQueryDto,
  ): Promise<MedicalDashboardResponseDto> {
    const caller = await this.horseAccess.currentUser(actor);
    const today = toClubDate(new Date());
    const herd = await this.checkups.herdCheckupAnchors(
      await this.barnFilter(caller.id, query),
    );
    const rows = query.healthStatus
      ? herd.filter((row) => row.healthStatus === query.healthStatus)
      : herd;
    const horseIds = rows.map((row) => row.horseId);
    const restrictedIds = rows
      .filter(
        (row) =>
          row.healthStatus === HorseHealthStatus.INJURED ||
          row.healthStatus === HorseHealthStatus.QUARANTINED,
      )
      .map((row) => row.horseId);
    const [
      checkups,
      careSchedules,
      openCases,
      pending,
      todayPrescriptions,
      since,
    ] = await Promise.all([
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
      this.dashboard.todayPrescriptions(horseIds, today),
      this.dashboard.healthStatusSince(restrictedIds),
    ]);

    return {
      herd: toHerdBlock(herd, query.healthStatus),
      checkups: checkups.filter(
        (item) => item.dueStatus !== CheckupDueStatus.OK,
      ),
      careSchedules:
        query.careAssignee === 'me'
          ? careSchedules.filter((row) => row.assignedTo === caller.id)
          : careSchedules,
      openCases,
      horsesWithoutCase: toHorsesWithoutCase(
        rows,
        new Set(openCases.map((row) => row.horseId)),
        new Map(since.map((row) => [row.horseId, row.since])),
      ),
      pendingRequests: pending.map(toExamRequestResponse),
      todayPrescriptions,
    };
  }

  /**
   * Dựng bộ lọc khu cho bảng điều khiển
   *
   * - barnId: chỉ khu đó
   * - mine = true: chỉ các khu người gọi phụ trách; đi cùng barnId thì lấy phần giao
   * - Không lọc gì: cả CLB
   *
   * @param callerId UUID của người gọi
   * @param query Bộ lọc barnId và mine
   * @returns Promise trả về bộ lọc khu cho đàn ngựa
   */
  private async barnFilter(
    callerId: string,
    query: MedicalDashboardQueryDto,
  ): Promise<HerdFilter> {
    return {
      ...(query.barnId && { barnId: query.barnId }),
      ...(query.mine && {
        barnIds: await this.stableAccess.trainerBarnIds(
          this.dataSource.manager,
          callerId,
        ),
      }),
    };
  }
}

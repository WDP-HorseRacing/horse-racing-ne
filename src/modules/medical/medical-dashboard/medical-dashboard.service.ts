import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { assertBarnInTrainerScope } from '../../stable/policies/stable.policy';
import { StableAccessService } from '../../stable/shared/stable-access.service';
import { CheckupDueStatus } from '../constants/checkup.enum';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import { CHECKUP_DUE_SOON_DAYS } from '../constants/medical.constants';
import { MedicalDashboardQueryDto, MedicalDashboardResponseDto } from '../dto';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { toExamRequestResponse, toHerdBlock } from '../mappers/medical.mapper';
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
   * Bảng điều khiển y tế gồm bốn khối, tính trực tiếp mỗi lần mở, không có chi phí
   *
   * - Sơ đồ đàn: đếm theo trạng thái sức khỏe trên cả đàn thuộc phạm vi khu (không bị lọc theo trạng thái sức khỏe); danh sách mỗi con kèm khu và ô chuồng để vẽ theo chuồng trại, Cách ly và Chấn thương lên đầu
   * - Lịch khám: các con Quá hạn và Đến hạn; kèm lịch tiêm phòng, tẩy giun, kiểm tra móng quá hạn hoặc đến hạn trong CHECKUP_DUE_SOON_DAYS ngày tới
   * - Bệnh án đang mở kèm buổi khám gần nhất và ngày hẹn tái khám
   * - Yêu cầu khám đang chờ, Khẩn lên trước
   * - Không tính ngựa đã chuyển nhượng và hồ sơ đã xóa; bộ lọc khu áp cho cả bốn khối; bộ lọc trạng thái sức khỏe áp cho danh sách ngựa của sơ đồ đàn và ba khối còn lại, không áp cho số đếm
   * - Head Trainer (không kiêm Club Manager, Veterinarian) chỉ xem các khu mình phụ trách; không chọn khu thì lấy mọi khu mình phụ trách
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Lọc theo khu và trạng thái sức khỏe
   * @returns Promise trả về bốn khối thông tin y tế
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc Head Trainer chọn khu không do mình phụ trách
   */
  async get(
    actor: Actor,
    query: MedicalDashboardQueryDto,
  ): Promise<MedicalDashboardResponseDto> {
    const caller = await this.horseAccess.currentUser(actor);
    const today = toClubDate(new Date());
    const herd = await this.checkups.herdCheckupAnchors(
      await this.barnFilter(actor, caller.id, query.barnId),
    );
    const rows = query.healthStatus
      ? herd.filter((row) => row.healthStatus === query.healthStatus)
      : herd;
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

    return {
      herd: toHerdBlock(herd, query.healthStatus),
      checkups: checkups.filter(
        (item) => item.dueStatus !== CheckupDueStatus.OK,
      ),
      careSchedules,
      openCases,
      pendingRequests: pending.map(toExamRequestResponse),
    };
  }

  /**
   * Chọn bộ lọc khu cho bảng điều khiển theo phạm vi của người gọi
   *
   * - Không bị giới hạn theo khu: lọc đúng khu được chọn, không chọn thì cả CLB
   * - Head Trainer bị giới hạn: khu được chọn phải do mình phụ trách; không chọn thì mọi khu mình phụ trách
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param barnId Khu được chọn, bỏ trống nếu không chọn
   * @returns Promise trả về bộ lọc khu cho đàn ngựa
   * @throws ForbiddenException Nếu Head Trainer chọn khu không do mình phụ trách
   */
  private async barnFilter(
    actor: Actor,
    callerId: string,
    barnId: string | undefined,
  ): Promise<HerdFilter> {
    if (!this.stableAccess.isBarnScopedTrainer(actor)) {
      return barnId ? { barnId } : {};
    }
    const barnIds = await this.stableAccess.trainerBarnIds(
      this.dataSource.manager,
      callerId,
    );
    if (!barnId) return { barnIds };
    assertBarnInTrainerScope(barnIds, barnId);
    return { barnId };
  }
}

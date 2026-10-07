import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import {
  clubDateTimeToInstant,
  clubToday,
} from '../../../common/utils/club-date';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import { HorseAlertPageDto, HorseAlertQueryDto } from '../dto/horse-alert.dto';
import {
  HorseWorkloadDto,
  HorseWorkloadQueryDto,
} from '../dto/horse-workload.dto';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import { toHorseAlert } from '../mappers/performance.mapper';
import { PerformanceDetailsRepository } from './performance-details.repository';

/**
 * Chi tiết hiệu suất của một con ngựa: lịch sử cảnh báo và khối lượng tập
 */
@Injectable()
export class PerformanceDetailsService {
  constructor(
    private readonly repository: PerformanceDetailsRepository,
    private readonly horseAccess: HorseAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy lịch sử điểm đo vượt ngưỡng (WARNING, CRITICAL) của ngựa qua mọi buổi tập, mới nhất trước
   *
   * - Club Manager, bác sĩ và Head Trainer của khu chứa ngựa được xem
   * - Lọc theo mức và theo khoảng ngày lịch CLB (from tính từ 00:00, to tính hết ngày)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Mức, khoảng ngày và trang
   * @returns Promise trả về một trang cảnh báo kèm tên buổi tập
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc Head Trainer xem ngựa ngoài khu mình
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem
   * @throws BadRequestException Nếu from sau to
   */
  async alerts(
    actor: Actor,
    horseId: string,
    query: HorseAlertQueryDto,
  ): Promise<HorseAlertPageDto> {
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
    const from = query.from?.slice(0, 10);
    const to = query.to?.slice(0, 10);
    if (from && to && from > to) {
      throw new BadRequestException('from phải nhỏ hơn hoặc bằng to');
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { rows, total } = await this.repository.alerts(
      horseId,
      query.level
        ? [query.level]
        : [MetricAlertLevel.WARNING, MetricAlertLevel.CRITICAL],
      from ? clubDateTimeToInstant(from, '00:00') : null,
      to ? clubDateTimeToInstant(shiftDays(to, 1), '00:00') : null,
      (page - 1) * limit,
      limit,
    );
    const names = await this.repository.sessionNames([
      ...new Set(rows.map((row) => row.meta.sessionId)),
    ]);
    return new PaginationResponseDto(
      rows.map((row) =>
        toHorseAlert(row, names.get(row.meta.sessionId) ?? null),
      ),
      total,
      page,
      limit,
    );
  }

  /**
   * Tổng hợp khối lượng tập của ngựa trong một khoảng ngày, chỉ tính lượt đã hoàn thành
   *
   * - Mặc định 7 ngày gần nhất tính tới hôm nay theo lịch CLB
   * - Ai xem được hồ sơ ngựa thì xem được khối lượng tập
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Khoảng ngày tùy chọn
   * @returns Promise trả về số lượt, số lượt theo cường độ, tổng cự ly dự kiến, tổng thời lượng và cự ly thực
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem
   * @throws BadRequestException Nếu from sau to
   */
  async workload(
    actor: Actor,
    horseId: string,
    query: HorseWorkloadQueryDto,
  ): Promise<HorseWorkloadDto> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const to = query.to?.slice(0, 10) ?? clubToday();
    const from = query.from?.slice(0, 10) ?? shiftDays(to, -6);
    if (from > to) {
      throw new BadRequestException('from phải nhỏ hơn hoặc bằng to');
    }
    const loads = await this.repository.completedLoads(horseId, from, to);
    const byIntensity = {
      [TrainingIntensity.LIGHT]: 0,
      [TrainingIntensity.MODERATE]: 0,
      [TrainingIntensity.HEAVY]: 0,
    };
    for (const load of loads) byIntensity[load.intensity] += 1;
    return {
      horseId,
      from,
      to,
      sessionsCompleted: loads.length,
      byIntensity,
      plannedDistanceM: loads.reduce((sum, l) => sum + l.plannedDistanceM, 0),
      actualDurationSeconds: loads.reduce(
        (sum, l) => sum + l.durationSeconds,
        0,
      ),
      actualDistanceM: await this.repository.actualDistanceM(
        loads.map((load) => load.participantId),
      ),
    };
  }
}

/**
 * Dời một ngày đi số ngày cho trước
 *
 * @param date Ngày dạng YYYY-MM-DD
 * @param days Số ngày, âm là lùi
 * @returns Ngày dạng YYYY-MM-DD
 */
function shiftDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

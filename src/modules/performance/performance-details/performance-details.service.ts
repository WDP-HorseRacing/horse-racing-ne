import { BadRequestException, Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { clubToday } from '../../../common/utils/club-date';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import {
  HorseWorkloadDto,
  HorseWorkloadQueryDto,
} from '../dto/horse-workload.dto';
import { PerformanceDetailsRepository } from './performance-details.repository';

/**
 * Chi tiết hiệu suất của một con ngựa: khối lượng tập
 */
@Injectable()
export class PerformanceDetailsService {
  constructor(
    private readonly repository: PerformanceDetailsRepository,
    private readonly horseAccess: HorseAccessService,
  ) {}

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

import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import { toHorseRaceResultResponse } from '../mappers/racing.mapper';
import { RacingRepository } from '../repositories/racing.repository';

@Injectable()
export class RacingService {
  constructor(
    private readonly racingRepository: RacingRepository,
    private readonly horseAccess: HorseAccessService,
  ) {}

  /**
   * Lấy lịch sử thi đấu của con ngựa, cuộc đua mới nhất đứng đầu
   *
   * - Phạm vi xem theo HorseAccessService.findReadable: Club Manager xem cả hồ sơ đã xóa, Horse Owner chỉ ngựa mình sở hữu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to danh sách kết quả thi đấu của con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listHorseResults(
    actor: Actor,
    horseId: string,
  ): Promise<HorseRaceResultResponseDto[]> {
    await this.horseAccess.findReadable(actor, horseId);
    const registrations =
      await this.racingRepository.listResultsByHorse(horseId);
    return registrations.map(toHorseRaceResultResponse);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { toHorseRaceResultResponse } from '../mappers/racing.mapper';

@Injectable()
export class RaceResultsService {
  constructor(
    @InjectRepository(RaceRegistrationEntity)
    private readonly registrationsRepo: Repository<RaceRegistrationEntity>,
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
    const registrations = await this.registrationsRepo.find({
      select: {
        id: true,
        status: true,
        placing: true,
        timeSeconds: true,
        race: { id: true, name: true, scheduledAt: true, status: true },
      },
      where: { horseId },
      relations: { race: true },
      order: { race: { scheduledAt: 'DESC' } },
    });
    return registrations.map(toHorseRaceResultResponse);
  }
}

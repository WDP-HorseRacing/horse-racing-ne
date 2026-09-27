import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { toInjuryMarkerResponse } from '../mappers/medical.mapper';

@Injectable()
export class InjuryCasesService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    @InjectRepository(InjuryMarkerEntity)
    private readonly injuries: Repository<InjuryMarkerEntity>,
  ) {}

  /**
   * Lấy danh sách vết thương của con ngựa.
   *
   * - Horse Owner xem đầy đủ như Veterinarian, nhưng chỉ với ngựa đang sở hữu.
   * - Head Trainer xem toàn câu lạc bộ (F1.3). Groom không xem (chặn ở controller).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Danh sách vết thương
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listInjuries(
    actor: Actor,
    horseId: string,
  ): Promise<InjuryMarkerResponseDto[]> {
    await this.horseAccess.findReadable(actor, horseId);
    const injuries = await this.injuries.find({
      where: { medicalRecord: { horseId } },
      order: { createdAt: 'DESC' },
    });
    return injuries.map(toInjuryMarkerResponse);
  }
}

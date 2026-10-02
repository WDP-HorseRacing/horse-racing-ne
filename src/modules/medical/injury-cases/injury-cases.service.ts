import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { InjuryTimelineItemDto } from '../dto/injury-marker.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { toInjuryTimelineItem } from '../mappers/medical.mapper';

@Injectable()
export class InjuryCasesService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Diễn biến chấn thương của con ngựa theo thời điểm khám.
   *
   * - Horse Owner xem đầy đủ như Veterinarian, nhưng chỉ với ngựa đang sở hữu.
   * - Head Trainer xem toàn câu lạc bộ. Groom không xem (chặn ở controller).
   * - Bỏ chấn thương của buổi khám đã hủy; xếp theo thời điểm khám tăng dần, kèm bệnh án.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về diễn biến chấn thương
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listInjuries(
    actor: Actor,
    horseId: string,
  ): Promise<InjuryTimelineItemDto[]> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const injuries = await this.dataSource.manager.find(InjuryMarkerEntity, {
      where: { medicalRecord: { horseId, voidedAt: IsNull() } },
      relations: { medicalRecord: true },
      order: { medicalRecord: { examDate: 'ASC' }, createdAt: 'ASC' },
    });
    return injuries.map(toInjuryTimelineItem);
  }
}

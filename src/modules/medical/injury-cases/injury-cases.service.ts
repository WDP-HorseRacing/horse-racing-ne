import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { RecoveryStatus } from '../constants/injury-marker.enum';
import { InjuryListQueryDto } from '../dto/injury-query.dto';
import { InjuryResponseDto } from '../dto/injury-marker.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { toInjuryResponses } from '../mappers/medical.mapper';

@Injectable()
export class InjuryCasesService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Các chấn thương của con ngựa, mỗi chấn thương kèm mức hồi phục hiện tại và diễn biến
   *
   * - Horse Owner xem đầy đủ như Veterinarian, nhưng chỉ với ngựa đang sở hữu.
   * - Head Trainer xem toàn câu lạc bộ. Groom không xem (chặn ở controller).
   * - Chỉ tính lần ghi nhận của buổi khám chưa hủy, xếp theo thời điểm khám rồi thời điểm ghi; chấn thương không còn lần ghi nhận nào thì không trả về
   * - Mức hiện tại là mức ở lần ghi nhận mới nhất; unhealedOnly bỏ chấn thương có mức hiện tại là Đã lành
   * - Danh sách xếp theo thời điểm khám sớm nhất của từng chấn thương
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Bộ lọc chỉ lấy chấn thương chưa lành
   * @returns Promise trả về các chấn thương của con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listInjuries(
    actor: Actor,
    horseId: string,
    query: InjuryListQueryDto,
  ): Promise<InjuryResponseDto[]> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const markers = await this.dataSource.manager.find(InjuryMarkerEntity, {
      where: { injury: { horseId }, medicalRecord: { voidedAt: IsNull() } },
      relations: { medicalRecord: true, injury: true },
      order: {
        medicalRecord: { examDate: 'ASC' },
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
    const injuries = toInjuryResponses(markers);
    return query.unhealedOnly
      ? injuries.filter(
          (injury) => injury.currentRecoveryStatus !== RecoveryStatus.HEALED,
        )
      : injuries;
  }
}

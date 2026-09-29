import { Injectable } from '@nestjs/common';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  HorseTrainingClassResponseDto,
  HorseTrainingSessionQueryDto,
  HorseTrainingSessionResponseDto,
} from '../dto/horse-training.dto';
import {
  toHorseTrainingClassResponse,
  toHorseTrainingSessionResponse,
} from '../mappers/horse-training.mapper';
import { HorseTrainingRepository } from './horse-training.repository';

/**
 * Đọc lớp và lịch buổi tập kèm kết quả của một con ngựa. Chỉ đọc.
 */
@Injectable()
export class HorseTrainingService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    private readonly repository: HorseTrainingRepository,
  ) {}

  /**
   * Liệt kê các lớp của con ngựa, lớp đang học trước rồi tới lớp đã rời
   *
   * - Vai trò được xem kiểm ở controller
   * - Phạm vi xem theo HorseAccessService.findReadable: Club Manager xem cả hồ sơ đã xóa, Horse Owner chỉ ngựa mình sở hữu, Head Trainer xem toàn câu lạc bộ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to các lớp của con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listClasses(
    actor: Actor,
    horseId: string,
  ): Promise<HorseTrainingClassResponseDto[]> {
    await this.horseAccess.findReadable(actor, horseId);
    const rows = await this.repository.listClasses(horseId);
    return rows.map(toHorseTrainingClassResponse);
  }

  /**
   * Đọc một trang lịch buổi tập của con ngựa, mỗi buổi kèm kết quả time trial
   *
   * - Quyền và phạm vi xem như listClasses
   * - Lọc theo lớp và theo buổi sắp tới / đã diễn ra (xem HorseTrainingRepository.listSessions)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Trang, lớp và khoảng thời gian cần lấy
   * @returns A promise resolving to một trang buổi tập của con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listSessions(
    actor: Actor,
    horseId: string,
    query: HorseTrainingSessionQueryDto,
  ): Promise<PaginationResponseDto<HorseTrainingSessionResponseDto>> {
    await this.horseAccess.findReadable(actor, horseId);
    const { rows, total } = await this.repository.listSessions(horseId, {
      classId: query.classId,
      when: query.when,
      now: new Date(),
      skip: (query.page - 1) * query.limit,
      limit: query.limit,
    });
    const trials = await this.repository.listTrialResults(
      rows.map((row) => row.participantId),
    );
    return new PaginationResponseDto(
      rows.map((row) => toHorseTrainingSessionResponse(row, trials)),
      total,
      query.page,
      query.limit,
    );
  }
}

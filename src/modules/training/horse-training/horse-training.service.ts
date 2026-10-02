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
import type {
  HorseTrainingEvaluationRow,
  HorseTrainingTrialRow,
} from '../types/horse-training.types';
import { HorseTrainingRepository } from './horse-training.repository';

/**
 * Gom các lần chạy time trial theo lượt tập
 *
 * - Trong mỗi lượt giữ nguyên thứ tự của mảng đầu vào
 *
 * @param trials Kết quả time trial của cả trang
 * @returns Map từ UUID lượt tập sang các lần chạy của lượt đó
 */
function groupTrialsByParticipant(
  trials: HorseTrainingTrialRow[],
): Map<string, HorseTrainingTrialRow[]> {
  const byParticipant = new Map<string, HorseTrainingTrialRow[]>();
  for (const trial of trials) {
    const group = byParticipant.get(trial.participantId);
    if (group) {
      group.push(trial);
    } else {
      byParticipant.set(trial.participantId, [trial]);
    }
  }
  return byParticipant;
}

/**
 * Chọn một đánh giá cho mỗi lượt tập
 *
 * - Một lượt có nhiều đánh giá thì lấy đánh giá đứng đầu trong mảng đầu vào
 *
 * @param evaluations Đánh giá của cả trang
 * @returns Map từ UUID lượt tập sang đánh giá của lượt đó
 */
function pickEvaluationByParticipant(
  evaluations: HorseTrainingEvaluationRow[],
): Map<string, HorseTrainingEvaluationRow> {
  const byParticipant = new Map<string, HorseTrainingEvaluationRow>();
  for (const evaluation of evaluations) {
    if (!byParticipant.has(evaluation.participantId)) {
      byParticipant.set(evaluation.participantId, evaluation);
    }
  }
  return byParticipant;
}

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
   * - Phạm vi xem theo HorseAccessService.findReadableHorseForActor: Club Manager xem cả hồ sơ đã xóa, Horse Owner chỉ ngựa mình sở hữu, Head Trainer xem toàn câu lạc bộ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về các lớp của con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listClasses(
    actor: Actor,
    horseId: string,
  ): Promise<HorseTrainingClassResponseDto[]> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const rows = await this.repository.listClasses(horseId);
    return rows.map(toHorseTrainingClassResponse);
  }

  /**
   * Đọc một trang lịch buổi tập của con ngựa, mỗi buổi kèm kết quả time trial và đánh giá
   *
   * - Quyền và phạm vi xem như listClasses
   * - Lọc theo lớp và theo buổi sắp tới / đã diễn ra (xem HorseTrainingRepository.listSessions)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Trang, lớp và khoảng thời gian cần lấy
   * @returns Promise trả về một trang buổi tập của con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listSessions(
    actor: Actor,
    horseId: string,
    query: HorseTrainingSessionQueryDto,
  ): Promise<PaginationResponseDto<HorseTrainingSessionResponseDto>> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const { rows, total } = await this.repository.listSessions(horseId, {
      classId: query.classId,
      when: query.when,
      now: new Date(),
      skip: (query.page - 1) * query.limit,
      limit: query.limit,
    });
    const participantIds = rows.map((row) => row.participantId);
    const [trials, evaluations] = await Promise.all([
      this.repository.listTrialResults(participantIds),
      this.repository.listEvaluations(participantIds),
    ]);
    const trialsByParticipant = groupTrialsByParticipant(trials);
    const evaluationByParticipant = pickEvaluationByParticipant(evaluations);
    return new PaginationResponseDto(
      rows.map((row) =>
        toHorseTrainingSessionResponse(
          row,
          trialsByParticipant.get(row.participantId) ?? [],
          evaluationByParticipant.get(row.participantId) ?? null,
        ),
      ),
      total,
      query.page,
      query.limit,
    );
  }
}

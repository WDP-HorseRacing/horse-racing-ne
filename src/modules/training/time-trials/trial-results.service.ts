import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { MediaService } from '../../media/services/media.service';
import {
  CreateTrialResultDto,
  TrialResultResponseDto,
  UpdateTrialResultVideoDto,
} from '../dto/time-trial.dto';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrialResultEntity } from '../entities/trial-result.entity';
import { toTrialResultResponse } from '../mappers/trial-result.mapper';
import { assertTrialVideoEditable } from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class TrialResultsService {
  constructor(
    @InjectRepository(TrialResultEntity)
    private readonly results: Repository<TrialResultEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly media: MediaService,
  ) {}

  /**
   * Liệt kê các lần chạy thử của một lượt tập, theo thứ tự lần chạy
   *
   * - Quyền xem theo TrainingAccessService.assertCanReadParticipant
   * - videoUrl là link xem video có hạn, null nếu lần chạy không có video; chỉ ký sau khi đã kiểm quyền xem
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia buổi tập
   * @returns Promise trả về các lần chạy thử kèm videoUrl
   * @throws ForbiddenException Nếu người gọi không được xem lượt tập này
   * @throws NotFoundException Nếu không có lượt tập
   */
  async list(
    actor: Actor,
    participantId: string,
  ): Promise<TrialResultResponseDto[]> {
    await this.access.assertCanReadParticipant(
      actor,
      participantId,
      this.dataSource.manager,
    );
    const rows = await this.results.find({
      where: { sessionParticipantId: participantId },
      order: { attemptNo: 'ASC' },
    });
    const videoUrls = await this.media.signDownloadUrls(
      rows
        .map((row) => row.videoMediaId)
        .filter((id): id is string => id !== null),
    );
    return rows.map((row) =>
      toTrialResultResponse(
        row,
        row.videoMediaId ? (videoUrls.get(row.videoMediaId) ?? null) : null,
      ),
    );
  }

  /**
   * Ghi một lần chạy thử cho lượt tập, có thể kèm video đã tải lên
   *
   * - Chỉ Head Trainer phụ trách lớp, buổi TIME_TRIAL đang IN_PROGRESS, lượt tập ONGOING hoặc COMPLETED
   * - Video (videoMediaId) phải do chính người ghi tải lên với mục đích TRIAL_VIDEO và đã có trên storage đúng như khai báo; kiểm trước khi mở transaction
   * - Mỗi lần chạy (attemptNo) của một lượt tập chỉ ghi một lần
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia buổi tập
   * @param body Số lần chạy, thời gian, ghi chú và video (nếu có)
   * @returns Promise trả về lần chạy vừa ghi kèm videoUrl
   * @throws ForbiddenException Nếu tài khoản không hoạt động hoặc người gọi không được thao tác lượt tập này
   * @throws NotFoundException Nếu không có lượt tập, chưa có cấu hình Time Trial, hoặc video không tồn tại hay không do người gọi tải lên
   * @throws BadRequestException Nếu video không phải TRIAL_VIDEO, sai định dạng, vượt dung lượng hoặc không khớp số liệu khai báo
   * @throws ConflictException Nếu buổi hoặc lượt tập sai trạng thái, video chưa có trên storage hoặc lần chạy đã tồn tại
   */
  async create(
    actor: Actor,
    participantId: string,
    body: CreateTrialResultDto,
  ): Promise<TrialResultResponseDto> {
    if (body.videoMediaId) {
      const uploader = await this.access.currentUser(actor);
      await this.media.assertAttachableTrialVideo(
        uploader.id,
        body.videoMediaId,
      );
    }
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      const session = await this.access.lockedSession(
        manager,
        context.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      const currentContext = await this.access.findParticipant(
        manager,
        participantId,
      );
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        currentContext,
      );
      if (session.sessionType !== TrainingSessionType.TIME_TRIAL) {
        throw new ConflictException('Buổi tập không phải buổi chạy thử');
      }
      if (session.status !== TrainingSessionStatus.IN_PROGRESS) {
        throw new ConflictException('Buổi tập chưa ở trạng thái đang diễn ra');
      }
      if (
        participant.status !== SessionParticipantStatus.ONGOING &&
        participant.status !== SessionParticipantStatus.COMPLETED
      ) {
        throw new ConflictException('Lượt tập không được ghi kết quả chạy thử');
      }
      const trial = await manager.findOneBy(TimeTrialEntity, {
        sessionId: session.id,
      });
      if (!trial) {
        throw new NotFoundException('Buổi tập chưa có cấu hình chạy thử');
      }
      const duplicate = await manager.findOneBy(TrialResultEntity, {
        timeTrialId: trial.id,
        sessionParticipantId: participantId,
        attemptNo: body.attemptNo,
      });
      if (duplicate) {
        throw new ConflictException('Lần chạy này đã được ghi');
      }
      return manager.save(
        manager.create(TrialResultEntity, {
          timeTrialId: trial.id,
          sessionParticipantId: participantId,
          attemptNo: body.attemptNo,
          elapsedMs: String(body.elapsedMs),
          notes: body.notes ?? null,
          videoMediaId: body.videoMediaId ?? null,
          recordedBy: caller.id,
          recordedAt: new Date(),
        }),
      );
    });
    const videoUrl = row.videoMediaId
      ? await this.media.signDownloadUrl(row.videoMediaId)
      : null;
    return toTrialResultResponse(row, videoUrl);
  }

  /**
   * Gắn, đổi hoặc gỡ video của một lần chạy thử, kể cả sau khi buổi tập kết thúc
   *
   * - Chỉ Head Trainer đang phụ trách lớp của lượt tập; không kiểm khu chuồng của ngựa
   * - Video khác null phải do chính người sửa tải lên với mục đích TRIAL_VIDEO và đã có trên storage; kiểm trước khi mở transaction
   * - videoMediaId null: gỡ video khỏi lần chạy, tệp cũ vẫn nằm trên storage
   * - Buổi đã hủy hoặc quá 7 ngày kể từ giờ kết thúc dự kiến: 409
   * - Chỉ đổi video, giữ nguyên thời gian, ghi chú và người ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia buổi tập
   * @param attemptNo Số lần chạy cần sửa video
   * @param body Id video mới, hoặc null để gỡ video
   * @returns Promise trả về lần chạy sau khi sửa kèm videoUrl
   * @throws ForbiddenException Nếu tài khoản không hoạt động hoặc người gọi không phải Head Trainer phụ trách lớp
   * @throws NotFoundException Nếu không có lượt tập, không có lần chạy, hoặc video không tồn tại hay không do người gọi tải lên
   * @throws BadRequestException Nếu video không phải TRIAL_VIDEO, sai định dạng, vượt dung lượng hoặc không khớp số liệu khai báo
   * @throws ConflictException Nếu buổi đã hủy, quá hạn gắn video hoặc video chưa có trên storage
   */
  async updateVideo(
    actor: Actor,
    participantId: string,
    attemptNo: number,
    body: UpdateTrialResultVideoDto,
  ): Promise<TrialResultResponseDto> {
    if (body.videoMediaId !== null) {
      const uploader = await this.access.currentUser(actor);
      await this.media.assertAttachableTrialVideo(
        uploader.id,
        body.videoMediaId,
      );
    }
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const context = await this.access.findParticipant(manager, participantId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        context.session.trainingClass.headTrainerId,
      );
      const session = await this.access.lockedSession(
        manager,
        context.sessionId,
      );
      const result = await manager.findOne(TrialResultEntity, {
        where: { sessionParticipantId: participantId, attemptNo },
        lock: { mode: 'pessimistic_write' },
      });
      if (!result) {
        throw new NotFoundException('Không tìm thấy lần chạy thử');
      }
      assertTrialVideoEditable(
        session.status,
        session.scheduledEndAt,
        new Date(),
      );
      result.videoMediaId = body.videoMediaId;
      return manager.save(result);
    });
    const videoUrl = row.videoMediaId
      ? await this.media.signDownloadUrl(row.videoMediaId)
      : null;
    return toTrialResultResponse(row, videoUrl);
  }
}

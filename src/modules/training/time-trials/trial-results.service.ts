import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import {
  CreateTrialResultDto,
  TrialResultResponseDto,
} from '../dto/time-trial.dto';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrialResultEntity } from '../entities/trial-result.entity';
import { toTrialResultResponse } from '../mappers/trial-result.mapper';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class TrialResultsService {
  constructor(
    @InjectRepository(TrialResultEntity)
    private readonly results: Repository<TrialResultEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

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
    return rows.map(toTrialResultResponse);
  }

  async create(
    actor: Actor,
    participantId: string,
    body: CreateTrialResultDto,
  ): Promise<TrialResultResponseDto> {
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
        throw new ConflictException('Session không phải TIME_TRIAL');
      }
      if (session.status !== TrainingSessionStatus.IN_PROGRESS) {
        throw new ConflictException('Session chưa IN_PROGRESS');
      }
      if (
        participant.status !== SessionParticipantStatus.ONGOING &&
        participant.status !== SessionParticipantStatus.COMPLETED
      ) {
        throw new ConflictException('Participant không được ghi Trial Result');
      }
      const trial = await manager.findOneBy(TimeTrialEntity, {
        sessionId: session.id,
      });
      if (!trial) {
        throw new NotFoundException('Session chưa có cấu hình Time Trial');
      }
      if (body.videoMediaId) {
        const media = await manager.findOneBy(MediaAssetEntity, {
          id: body.videoMediaId,
        });
        if (!media) {
          throw new NotFoundException('Không tìm thấy video media');
        }
        if (!media.mimeType.toLowerCase().startsWith('video/')) {
          throw new BadRequestException('Media đính kèm phải là video');
        }
      }
      const duplicate = await manager.findOneBy(TrialResultEntity, {
        timeTrialId: trial.id,
        sessionParticipantId: participantId,
        attemptNo: body.attemptNo,
      });
      if (duplicate) {
        throw new ConflictException('Attempt đã tồn tại');
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
    return toTrialResultResponse(row);
  }
}

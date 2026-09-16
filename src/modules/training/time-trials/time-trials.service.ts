import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { TrainingSessionStatus } from '../constants/training-session-status.enum';
import {
  CreateTimeTrialDto,
  TimeTrialResponseDto,
} from '../dto/time-trial.dto';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { toTimeTrialResponse } from '../mappers/training.mapper';
import { TrainingAccessService } from '../shared/training-access.service';
import { TimeTrialsRepository } from './time-trials.repository';

@Injectable()
export class TimeTrialsService {
  constructor(
    private readonly timeTrialsRepo: TimeTrialsRepository,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async list(actor: Actor, sessionId: string): Promise<TimeTrialResponseDto[]> {
    await this.access.sessionForActor(actor, sessionId);
    return (await this.timeTrialsRepo.listBySession(sessionId)).map(
      toTimeTrialResponse,
    );
  }

  async create(
    actor: Actor,
    sessionId: string,
    body: CreateTimeTrialDto,
  ): Promise<TimeTrialResponseDto> {
    const caller = await this.access.currentUser(actor);
    const row = await this.dataSource.transaction(async (manager) => {
      const session = await this.access.lockedSessionInClub(
        manager,
        sessionId,
        caller.clubId!,
      );
      this.access.assertCanOperateSession(actor, caller.id, session);
      if (session.status !== TrainingSessionStatus.IN_PROGRESS) {
        throw new ConflictException(
          'Chỉ ghi time trial khi buổi tập IN_PROGRESS',
        );
      }
      if (body.videoAssetId) {
        const media = await manager.findOneBy(MediaAssetEntity, {
          id: body.videoAssetId,
          clubId: caller.clubId!,
        });
        if (!media)
          throw new NotFoundException('Không tìm thấy media trong CLB');
      }
      return manager.save(
        manager.create(TimeTrialEntity, {
          sessionId,
          distanceMeters: String(body.distanceMeters),
          durationSeconds: String(body.durationSeconds),
          videoAssetId: body.videoAssetId ?? null,
          notes: body.notes ?? null,
        }),
      );
    });
    return toTimeTrialResponse(row);
  }

  async get(actor: Actor, id: string): Promise<TimeTrialResponseDto> {
    const clubId = await this.access.clubId(actor);
    const row = await this.timeTrialsRepo.findById(id);
    if (!row || row.session.plan.horse.clubId !== clubId) {
      throw new NotFoundException('Không tìm thấy kết quả time trial');
    }
    return toTimeTrialResponse(row);
  }
}

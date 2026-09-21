import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  CreateTimeTrialDto,
  TimeTrialResponseDto,
} from '../dto/time-trial.dto';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { toTimeTrialResponse } from '../mappers/training.mapper';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class TimeTrialsService {
  constructor(
    @InjectRepository(TimeTrialEntity)
    private readonly timeTrials: Repository<TimeTrialEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /** Liệt kê time trial của session sau khi xác nhận actor được xem session. */
  async list(actor: Actor, sessionId: string): Promise<TimeTrialResponseDto[]> {
    await this.access.sessionForActor(actor, sessionId);
    const rows = await this.timeTrials.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toTimeTrialResponse);
  }

  /**
   * Ghi time trial trong transaction; session phải đang IN_PROGRESS và video
   * asset, nếu có, phải tồn tại.
   */
  async create(
    actor: Actor,
    sessionId: string,
    body: CreateTimeTrialDto,
  ): Promise<TimeTrialResponseDto> {
    const caller = await this.access.currentUser(actor);
    const row = await this.dataSource.transaction(async (manager) => {
      const session = await this.access.lockedSession(manager, sessionId);
      await this.access.assertCanOperateSession(
        manager,
        actor,
        caller.id,
        session,
      );
      if (session.status !== TrainingSessionStatus.IN_PROGRESS) {
        throw new ConflictException(
          'Chỉ ghi time trial khi buổi tập IN_PROGRESS',
        );
      }
      if (body.videoAssetId) {
        const media = await manager.findOneBy(MediaAssetEntity, {
          id: body.videoAssetId,
        });
        if (!media) throw new NotFoundException('Không tìm thấy media');
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

  /** Tải một time trial cùng session, plan và horse để trả response đầy đủ. */
  async get(actor: Actor, trialId: string): Promise<TimeTrialResponseDto> {
    await this.access.currentUser(actor);
    const row = await this.timeTrials.findOne({
      where: { id: trialId },
      relations: { session: { plan: { horse: true } } },
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy kết quả time trial');
    }
    return toTimeTrialResponse(row);
  }
}

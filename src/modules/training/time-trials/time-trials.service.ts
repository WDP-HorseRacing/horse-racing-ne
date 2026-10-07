import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import {
  CreateTimeTrialDto,
  TimeTrialResponseDto,
} from '../dto/time-trial.dto';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { toTimeTrialResponse } from '../mappers/time-trial.mapper';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class TimeTrialsService {
  constructor(
    @InjectRepository(TimeTrialEntity)
    private readonly timeTrials: Repository<TimeTrialEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async getBySession(
    actor: Actor,
    sessionId: string,
  ): Promise<TimeTrialResponseDto> {
    await this.access.assertCanReadSession(actor, sessionId);
    const row = await this.timeTrials.findOneBy({ sessionId });
    if (!row) throw new NotFoundException('Session chưa có cấu hình Time Trial');
    return toTimeTrialResponse(row);
  }

  async create(
    actor: Actor,
    sessionId: string,
    body: CreateTimeTrialDto,
  ): Promise<TimeTrialResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const session = await this.access.lockedSession(manager, sessionId);
      const plan = await this.access.findPlan(manager, session.planId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        plan.trainingClass.headTrainerId,
      );
      if (
        plan.status !== TrainingPlanStatus.SCHEDULED &&
        plan.status !== TrainingPlanStatus.ACTIVE
      ) {
        throw new ConflictException(
          'Không thể cấu hình Time Trial cho plan đã kết thúc',
        );
      }
      if (plan.trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Class phải ACTIVE để cấu hình Time Trial');
      }
      if (session.sessionType !== TrainingSessionType.TIME_TRIAL) {
        throw new ConflictException('Session không phải TIME_TRIAL');
      }
      if (
        session.status !== TrainingSessionStatus.DRAFT &&
        session.status !== TrainingSessionStatus.SCHEDULED
      ) {
        throw new ConflictException(
          'Chỉ cấu hình Time Trial trước khi thực thi',
        );
      }
      const existing = await manager.findOneBy(TimeTrialEntity, { sessionId });
      if (existing)
        throw new ConflictException('Session đã có cấu hình Time Trial');
      return manager.save(
        manager.create(TimeTrialEntity, {
          sessionId,
          distanceM: String(body.distanceM),
          targetTimeMs:
            body.targetTimeMs === undefined ? null : String(body.targetTimeMs),
          notes: body.notes ?? null,
        }),
      );
    });
    return toTimeTrialResponse(row);
  }

  async get(actor: Actor, trialId: string): Promise<TimeTrialResponseDto> {
    const row = await this.timeTrials.findOne({
      where: { id: trialId },
      relations: { session: { trainingClass: true } },
    });
    if (!row) throw new NotFoundException('Không tìm thấy Time Trial');
    await this.access.assertCanReadSession(actor, row.sessionId);
    return toTimeTrialResponse(row);
  }
}

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
  UpdateTimeTrialDto,
} from '../dto/time-trial.dto';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { toTimeTrialResponse } from '../mappers/time-trial.mapper';
import {
  assertClassOpenForSessions,
  assertSessionEditable,
} from '../policies/training.policy';
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
    if (!row) throw new NotFoundException('Buổi tập chưa có cấu hình chạy thử');
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
      const trainingClass = await this.access.findTrainingClass(
        manager,
        session.classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      assertClassOpenForSessions(trainingClass.status);
      if (session.sessionType !== TrainingSessionType.TIME_TRIAL) {
        throw new ConflictException('Buổi tập không phải buổi chạy thử');
      }
      if (
        session.status !== TrainingSessionStatus.DRAFT &&
        session.status !== TrainingSessionStatus.SCHEDULED
      ) {
        throw new ConflictException(
          'Chỉ được cấu hình chạy thử trước khi buổi tập bắt đầu',
        );
      }
      const existing = await manager.findOneBy(TimeTrialEntity, { sessionId });
      if (existing)
        throw new ConflictException('Buổi tập đã có cấu hình chạy thử');
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

  /**
   * Sửa cấu hình chạy thử của một buổi còn nháp
   *
   * - Field không gửi giữ giá trị cũ; gửi null để xóa thời gian mục tiêu hoặc ghi chú
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @param body Các field cần sửa
   * @returns Promise trả về cấu hình chạy thử sau khi sửa
   * @throws ForbiddenException Nếu người gọi không quản lý lớp
   * @throws NotFoundException Nếu không có buổi tập, lớp hoặc cấu hình chạy thử
   * @throws ConflictException Nếu lớp đã kết thúc hoặc buổi không còn nháp
   */
  async update(
    actor: Actor,
    sessionId: string,
    body: UpdateTimeTrialDto,
  ): Promise<TimeTrialResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const session = await this.access.lockedSession(manager, sessionId);
      const trainingClass = await this.access.findTrainingClass(
        manager,
        session.classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      assertClassOpenForSessions(trainingClass.status);
      assertSessionEditable(session.status);
      const trial = await manager.findOneBy(TimeTrialEntity, { sessionId });
      if (!trial)
        throw new NotFoundException('Không tìm thấy cấu hình chạy thử');
      if (body.distanceM !== undefined) {
        trial.distanceM = String(body.distanceM);
      }
      if (body.targetTimeMs !== undefined) {
        trial.targetTimeMs =
          body.targetTimeMs === null ? null : String(body.targetTimeMs);
      }
      if (body.notes !== undefined) trial.notes = body.notes;
      return manager.save(trial);
    });
    return toTimeTrialResponse(row);
  }

  async get(actor: Actor, trialId: string): Promise<TimeTrialResponseDto> {
    const row = await this.timeTrials.findOne({
      where: { id: trialId },
      relations: { session: { trainingClass: true } },
    });
    if (!row) throw new NotFoundException('Không tìm thấy cấu hình chạy thử');
    await this.access.assertCanReadSession(actor, row.sessionId);
    return toTimeTrialResponse(row);
  }
}

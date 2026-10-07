import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import {
  CancelTrainingSessionDto,
  CreateTrainingSessionDto,
  TrainingSessionResponseDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { toTrainingSessionResponse } from '../mappers/training-session.mapper';
import {
  assertSessionCancellable,
  assertSessionEditable,
  assertSessionPublishable,
  assertClassOpenForSessions,
  assertSessionWindowInClass,
  eligibilityForSession,
  initialParticipantEligibility,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectRepository(TrainingSessionEntity)
    private readonly sessions: Repository<TrainingSessionEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Liệt kê các buổi tập của lớp theo giờ bắt đầu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @returns Promise trả về các buổi tập, sớm nhất trước
   * @throws NotFoundException Nếu không có lớp hoặc người gọi không được xem lớp
   */
  async listSessions(
    actor: Actor,
    classId: string,
  ): Promise<TrainingSessionResponseDto[]> {
    await this.access.assertCanReadClass(actor, classId);
    const rows = await this.sessions.find({
      where: { classId },
      order: { scheduledStartAt: 'ASC' },
    });
    return rows.map(toTrainingSessionResponse);
  }

  async getSessionById(
    actor: Actor,
    sessionId: string,
  ): Promise<TrainingSessionResponseDto> {
    return toTrainingSessionResponse(
      await this.access.sessionForActor(actor, sessionId),
    );
  }

  /**
   * Thêm một buổi tập nháp vào lớp
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @param body Nội dung buổi tập, môn học tùy chọn
   * @returns Promise trả về buổi tập vừa tạo ở trạng thái DRAFT
   * @throws ForbiddenException Nếu người gọi không quản lý lớp
   * @throws NotFoundException Nếu không có lớp
   * @throws ConflictException Nếu lớp đã hoàn thành hoặc đã hủy
   * @throws BadRequestException Nếu giờ buổi tập sai hoặc nằm ngoài thời gian của lớp, hoặc môn học không tồn tại
   */
  async createSession(
    actor: Actor,
    classId: string,
    body: CreateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const trainingClass = await this.access.lockedTrainingClass(
        manager,
        classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      assertClassOpenForSessions(trainingClass.status);
      assertSessionWindowInClass(
        body.scheduledStartAt,
        body.scheduledEndAt,
        trainingClass.startDate,
        trainingClass.endDate,
      );
      if (
        body.subjectId &&
        !(await manager.existsBy(TrainingSubjectEntity, { id: body.subjectId }))
      ) {
        throw new BadRequestException('Môn học không tồn tại');
      }
      return manager.save(
        manager.create(TrainingSessionEntity, {
          classId,
          subjectId: body.subjectId ?? null,
          name: body.name,
          sessionType: body.sessionType,
          intensity: body.intensity,
          plannedDistanceM: body.plannedDistanceM,
          scheduledStartAt: new Date(body.scheduledStartAt),
          scheduledEndAt: new Date(body.scheduledEndAt),
          location: body.location ?? null,
          surface: body.surface ?? null,
          notes: body.notes ?? null,
          status: TrainingSessionStatus.DRAFT,
        }),
      );
    });
    return toTrainingSessionResponse(row);
  }

  async updateSession(
    actor: Actor,
    sessionId: string,
    body: UpdateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
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
      const nextSessionType = body.sessionType ?? session.sessionType;
      if (nextSessionType !== session.sessionType) {
        const configuredTrial = await manager.findOneBy(TimeTrialEntity, {
          sessionId,
        });
        if (
          configuredTrial &&
          nextSessionType !== TrainingSessionType.TIME_TRIAL
        ) {
          throw new ConflictException(
            'Không thể đổi session về REGULAR khi đã có cấu hình Time Trial',
          );
        }
      }
      const start = body.scheduledStartAt
        ? new Date(body.scheduledStartAt)
        : session.scheduledStartAt;
      const end = body.scheduledEndAt
        ? new Date(body.scheduledEndAt)
        : session.scheduledEndAt;
      assertSessionWindowInClass(
        start,
        end,
        trainingClass.startDate,
        trainingClass.endDate,
      );
      if (
        body.subjectId &&
        !(await manager.existsBy(TrainingSubjectEntity, { id: body.subjectId }))
      ) {
        throw new BadRequestException('Môn học không tồn tại');
      }
      Object.assign(session, {
        subjectId: body.subjectId ?? session.subjectId,
        name: body.name ?? session.name,
        sessionType: nextSessionType,
        intensity: body.intensity ?? session.intensity,
        plannedDistanceM: body.plannedDistanceM ?? session.plannedDistanceM,
        scheduledStartAt: start,
        scheduledEndAt: end,
        location: body.location ?? session.location,
        surface: body.surface ?? session.surface,
        notes: body.notes ?? session.notes,
      });
      return manager.save(session);
    });
    return toTrainingSessionResponse(row);
  }

  async publishSession(
    actor: Actor,
    sessionId: string,
  ): Promise<TrainingSessionResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const session = await this.access.lockedSession(manager, sessionId);
      const trainingClass = await this.access.lockedTrainingClass(
        manager,
        session.classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      assertSessionPublishable(session.status);
      if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Class không còn ACTIVE');
      }
      if (session.sessionType === TrainingSessionType.TIME_TRIAL) {
        const configuredTrial = await manager.findOneBy(TimeTrialEntity, {
          sessionId: session.id,
        });
        if (!configuredTrial) {
          throw new ConflictException(
            'Session TIME_TRIAL phải có cấu hình Time Trial trước khi publish',
          );
        }
      }
      const enrollments = await manager
        .getRepository(HorseEnrollmentEntity)
        .createQueryBuilder('enrollment')
        .where('enrollment.class_id = :classId', { classId: trainingClass.id })
        .andWhere('enrollment.status <> :cancelledStatus', {
          cancelledStatus: HorseEnrollmentStatus.CANCELLED,
        })
        .andWhere('enrollment.enrolled_at <= :scheduledStartAt', {
          scheduledStartAt: session.scheduledStartAt,
        })
        .andWhere(
          '(enrollment.left_at IS NULL OR :scheduledStartAt < enrollment.left_at)',
          { scheduledStartAt: session.scheduledStartAt },
        )
        .orderBy('enrollment.horse_id', 'ASC')
        .getMany();

      for (const enrollment of enrollments) {
        const horse = await this.access.lockedHorse(
          manager,
          enrollment.horseId,
        );
        await this.access.assertTrainerBarn(
          manager,
          actor,
          caller.id,
          horse.id,
        );
        const existing = await manager.findOneBy(SessionParticipantEntity, {
          sessionId: session.id,
          horseId: horse.id,
        });
        if (existing) continue;
        const activeLock = await manager.findOneBy(TrainingLockEntity, {
          horseId: horse.id,
          status: TrainingLockStatus.ACTIVE,
        });
        const eligibility = eligibilityForSession(
          evaluateEligibility({
            isDeleted: Boolean(horse.deletedAt),
            lifecycleStatus: horse.lifecycleStatus,
            healthStatus: horse.healthStatus,
            hasActiveTrainingLock: !!activeLock,
          }),
          session.intensity,
        );
        const groom = await this.findGroomAt(
          manager,
          horse.id,
          session.scheduledStartAt,
        );
        await manager.save(
          manager.create(SessionParticipantEntity, {
            sessionId: session.id,
            horseId: horse.id,
            horseEnrollmentId: enrollment.id,
            assignedGroomId: groom?.groomId ?? null,
            ...initialParticipantEligibility(eligibility, !!activeLock),
          }),
        );
      }
      session.status = TrainingSessionStatus.SCHEDULED;
      return manager.save(session);
    });
    return toTrainingSessionResponse(row);
  }

  async cancelSession(
    actor: Actor,
    sessionId: string,
    body: CancelTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
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
      assertSessionCancellable(session.status);
      const ongoing = await manager.countBy(SessionParticipantEntity, {
        sessionId,
        status: SessionParticipantStatus.ONGOING,
      });
      if (ongoing)
        throw new ConflictException(
          'Không thể hủy session đang có participant ONGOING',
        );
      await manager
        .createQueryBuilder()
        .update(SessionParticipantEntity)
        .set({
          status: SessionParticipantStatus.CANCELLED,
          cancelReason: body.reason,
        })
        .where('session_id = :sessionId', { sessionId })
        .andWhere('status IN (:...statuses)', {
          statuses: [
            SessionParticipantStatus.PLANNED,
            SessionParticipantStatus.PRESENT,
            SessionParticipantStatus.READY,
          ],
        })
        .execute();
      session.status = TrainingSessionStatus.CANCELLED;
      session.cancelledAt = new Date();
      session.cancelledBy = caller.id;
      session.cancelReason = body.reason;
      return manager.save(session);
    });
    return toTrainingSessionResponse(row);
  }

  private findGroomAt(manager: EntityManager, horseId: string, at: Date) {
    return manager
      .getRepository(GroomAssignmentEntity)
      .createQueryBuilder('assignment')
      .where('assignment.horse_id = :horseId', { horseId })
      .andWhere('assignment.start_at <= :at', { at })
      .andWhere('(assignment.end_at IS NULL OR :at < assignment.end_at)', {
        at,
      })
      .orderBy('assignment.start_at', 'DESC')
      .getOne();
  }
}

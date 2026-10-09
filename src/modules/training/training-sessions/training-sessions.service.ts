import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import type { Actor } from '../../../common/types/actor';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import {
  CancelTrainingSessionDto,
  CreateTrainingSessionDto,
  PublishClassSessionsDto,
  PublishedSessionResponseDto,
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
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import {
  toPublishedSessionResponse,
  toTrainingSessionResponse,
} from '../mappers/training-session.mapper';
import {
  assertNoOverlappingClassSession,
  assertSessionCancellable,
  assertSessionEditable,
  assertSessionPublishable,
  assertClassOpenForSessions,
  assertSessionWindowInClass,
  eligibilityForSession,
  findOverlappingHolding,
  initialParticipantEligibility,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import type { SkippedHorse } from '../types/training-session.types';

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
   * @throws ConflictException Nếu lớp đã hoàn thành hoặc đã hủy, hoặc buổi trùng giờ với buổi chưa hủy khác của lớp
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
      assertNoOverlappingClassSession(
        {
          scheduledStartAt: new Date(body.scheduledStartAt),
          scheduledEndAt: new Date(body.scheduledEndAt),
        },
        await manager.find(TrainingSessionEntity, {
          where: { classId, status: Not(TrainingSessionStatus.CANCELLED) },
        }),
      );
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
      const trainingClass = await this.access.lockedTrainingClass(
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
            'Không thể đổi về buổi thường khi đã có cấu hình chạy thử',
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
      if (body.scheduledStartAt || body.scheduledEndAt) {
        assertNoOverlappingClassSession(
          { scheduledStartAt: start, scheduledEndAt: end },
          await manager.find(TrainingSessionEntity, {
            where: {
              classId: session.classId,
              id: Not(sessionId),
              status: Not(TrainingSessionStatus.CANCELLED),
            },
          }),
        );
      }
      Object.assign(session, {
        subjectId: body.subjectId ?? session.subjectId,
        name: body.name ?? session.name,
        sessionType: nextSessionType,
        intensity: body.intensity ?? session.intensity,
        plannedDistanceM: body.plannedDistanceM ?? session.plannedDistanceM,
        scheduledStartAt: start,
        scheduledEndAt: end,
        location:
          body.location === undefined ? session.location : body.location,
        surface: body.surface === undefined ? session.surface : body.surface,
        notes: body.notes === undefined ? session.notes : body.notes,
      });
      return manager.save(session);
    });
    return toTrainingSessionResponse(row);
  }

  /**
   * Publish một buổi nháp của lớp và tạo lượt tập cho từng ngựa đang học lớp
   *
   * - Ngựa đang giữ chỗ ở lớp khác trùng giờ với buổi: không tạo lượt, trả trong skippedHorses
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @returns Promise trả về buổi vừa publish kèm các ngựa bị bỏ qua vì trùng giờ
   * @throws ForbiddenException Nếu người gọi không quản lý lớp, hoặc có ngựa ngoài khu của Head Trainer
   * @throws NotFoundException Nếu không có buổi tập hoặc lớp
   * @throws ConflictException Nếu buổi không còn nháp, lớp không còn ACTIVE, hoặc buổi chạy thử chưa cấu hình chạy thử
   */
  async publishSession(
    actor: Actor,
    sessionId: string,
  ): Promise<PublishedSessionResponseDto> {
    const published = await this.dataSource.transaction(async (manager) => {
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
      return this.publishLocked(
        manager,
        actor,
        caller.id,
        trainingClass,
        session,
      );
    });
    return toPublishedSessionResponse(published.session, published.skipped);
  }

  /**
   * Publish một lần mọi buổi nháp của lớp, hoặc chỉ các buổi có ngày bắt đầu (theo lịch CLB) trong khoảng from–to
   *
   * - Chạy trong một transaction: một buổi lỗi thì không buổi nào được publish
   * - Mỗi buổi áp đúng luật của publish từng buổi, theo thứ tự giờ bắt đầu
   * - Không có buổi nháp nào khớp thì trả danh sách rỗng
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @param body Khoảng ngày tùy chọn
   * @returns Promise trả về các buổi vừa publish, sớm nhất trước, mỗi buổi kèm ngựa bị bỏ qua vì trùng giờ
   * @throws ForbiddenException Nếu người gọi không quản lý lớp, hoặc có ngựa ngoài khu của Head Trainer
   * @throws NotFoundException Nếu không có lớp
   * @throws BadRequestException Nếu from sau to
   * @throws ConflictException Nếu lớp không còn ACTIVE, hoặc có buổi chạy thử chưa cấu hình chạy thử
   */
  async publishClassSessions(
    actor: Actor,
    classId: string,
    body: PublishClassSessionsDto,
  ): Promise<PublishedSessionResponseDto[]> {
    if (body.from && body.to && body.from > body.to) {
      throw new BadRequestException('Từ ngày phải trước hoặc bằng đến ngày');
    }
    const rows = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const query = manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.class_id = :classId', { classId })
        .andWhere('session.status = :status', {
          status: TrainingSessionStatus.DRAFT,
        })
        .setParameter('timeZone', CLUB_TIME_ZONE);
      if (body.from) {
        query.andWhere(
          '(session.scheduled_start_at AT TIME ZONE :timeZone)::date >= :from',
          { from: body.from.slice(0, 10) },
        );
      }
      if (body.to) {
        query.andWhere(
          '(session.scheduled_start_at AT TIME ZONE :timeZone)::date <= :to',
          { to: body.to.slice(0, 10) },
        );
      }
      const drafts = await query
        .orderBy('session.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      const trainingClass = await this.access.lockedTrainingClass(
        manager,
        classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      const ordered = [...drafts].sort(
        (a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime(),
      );
      const published: Array<{
        session: TrainingSessionEntity;
        skipped: SkippedHorse[];
      }> = [];
      for (const session of ordered) {
        published.push(
          await this.publishLocked(
            manager,
            actor,
            caller.id,
            trainingClass,
            session,
          ),
        );
      }
      return published;
    });
    return rows.map((row) =>
      toPublishedSessionResponse(row.session, row.skipped),
    );
  }

  /**
   * Publish một buổi đã khóa: kiểm trạng thái buổi và lớp, cấu hình chạy thử, rồi tạo lượt tập cho từng ngựa đang học lớp
   *
   * - Khóa row từng con ngựa trước khi tạo lượt
   * - Ngựa đang giữ chỗ ở lớp khác trùng giờ với buổi: không tạo lượt, đưa vào danh sách bị bỏ qua
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param trainingClass Lớp của buổi, đã khóa
   * @param session Buổi tập, đã khóa
   * @returns Promise trả về buổi sau khi chuyển SCHEDULED và các ngựa bị bỏ qua vì trùng giờ
   * @throws ConflictException Nếu buổi không còn nháp, lớp không còn ACTIVE, hoặc buổi chạy thử chưa có cấu hình chạy thử
   * @throws ForbiddenException Nếu Head Trainer gặp ngựa ngoài khu mình phụ trách
   */
  private async publishLocked(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    trainingClass: TrainingClassEntity,
    session: TrainingSessionEntity,
  ): Promise<{ session: TrainingSessionEntity; skipped: SkippedHorse[] }> {
    assertSessionPublishable(session.status);
    if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
      throw new ConflictException('Lớp không còn ở trạng thái đang chạy');
    }
    if (session.sessionType === TrainingSessionType.TIME_TRIAL) {
      const configuredTrial = await manager.findOneBy(TimeTrialEntity, {
        sessionId: session.id,
      });
      if (!configuredTrial) {
        throw new ConflictException(
          'Buổi chạy thử phải có cấu hình chạy thử trước khi công bố',
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

    const skipped: SkippedHorse[] = [];
    for (const enrollment of enrollments) {
      const horse = await this.access.lockedHorse(
        manager,
        enrollment.horseId,
      );
      await this.access.assertTrainerBarn(
        manager,
        actor,
        callerId,
        horse.id,
      );
      const existing = await manager.findOneBy(SessionParticipantEntity, {
        sessionId: session.id,
        horseId: horse.id,
      });
      if (existing) continue;
      const clash = findOverlappingHolding(
        session,
        await this.access.horseSessionHoldings(
          manager,
          horse.id,
          trainingClass.id,
        ),
      );
      if (clash) {
        skipped.push({
          horseId: horse.id,
          horseName: horse.name,
          conflictClassCode: clash.classCode,
          conflictStartAt: clash.scheduledStartAt,
        });
        continue;
      }
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
    return { session: await manager.save(session), skipped };
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
          'Không thể hủy buổi tập khi còn lượt tập đang tập',
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

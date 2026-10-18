import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { toClubDate } from '../../../common/utils/club-date';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import {
  CancelTrainingSessionDto,
  CreateTrainingSessionDto,
  CreateTrainingSessionsDto,
  TrainingSessionResponseDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrainingClassPhaseEntity } from '../entities/training-class-phase.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { toTrainingSessionResponse } from '../mappers/training-session.mapper';
import {
  assertNoGroomRunClashes,
  assertNoOverlappingClassSession,
  assertSessionCancellable,
  assertSessionEditable,
  assertClassOpenForSessions,
  assertSessionWindowInClass,
  assertSubjectExercise,
  classPhaseOn,
  eligibilityForSession,
  assertClassDailyLoad,
  findDailyLoadConflict,
  findHorseScheduleClashes,
  horseDailyLoadError,
  sessionsByHorse,
  horseScheduleClashError,
  initialParticipantEligibility,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import { sessionAuditData } from '../utils/training-audit';
import { TRAINING_SESSION_CANCELLED_EVENT } from '../constants/training-events.constants';
import type {
  GroomRun,
  SessionWindow,
  TrainingSessionCancelledEvent,
} from '../types/training-session.types';

/**
 * Lượt tập được đồng bộ lại khi buổi đổi giờ hoặc cường độ
 */
const SYNCED_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.CANCELLED_BY_LOCK,
  SessionParticipantStatus.INELIGIBLE,
];

/**
 * Lượt tập chưa diễn ra, bị hủy theo khi hủy buổi
 */
const CANCELLABLE_RUN_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
];

/**
 * Lượt tập đã điểm danh trở đi, chặn sửa buổi
 */
const NOT_ENROLLED_AT_START_REASON = 'Ngựa không học lớp vào giờ mới của buổi';

/**
 * Gắn thứ tự buổi trong body vào lỗi khi thêm nhiều buổi một lần
 *
 * - Câu báo thêm tiền tố "Buổi {chỉ số + 1}: "
 * - Ô lỗi đổi thành `sessions.{chỉ số}.{ô cũ}`; lỗi không gắn ô thì gắn `sessions.{chỉ số}`
 * - Lỗi không phải HttpException giữ nguyên
 *
 * @param error Lỗi ném ra khi lưu một buổi
 * @param index Chỉ số của buổi trong body
 * @returns Lỗi để ném tiếp
 */
function withSessionIndex(error: unknown, index: number): unknown {
  if (!(error instanceof HttpException)) return error;
  const response = error.getResponse();
  const responseMessage =
    typeof response === 'string'
      ? response
      : (response as { message?: unknown }).message;
  const original =
    typeof responseMessage === 'string' ? responseMessage : error.message;
  const message = `Buổi ${index + 1}: ${original}`;
  const fields =
    typeof response === 'object' &&
    Array.isArray((response as { errors?: unknown }).errors)
      ? (response as { errors: Array<{ field: string }> }).errors.map(
          (item) => `sessions.${index}.${item.field}`,
        )
      : [`sessions.${index}`];
  return new HttpException(
    { message, errors: fields.map((field) => ({ field, message })) },
    error.getStatus(),
  );
}

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectRepository(TrainingSessionEntity)
    private readonly sessions: Repository<TrainingSessionEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
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
   * Thêm một buổi tập đã lên lịch vào lớp, kèm lượt tập cho các ngựa đang học lớp vào giờ bắt đầu
   *
   * - Loại buổi lấy theo môn của buổi; gửi kèm loại buổi thì phải trùng loại buổi của môn
   * - Buổi chạy thử được tạo sẵn cấu hình chạy thử (cự ly theo cự ly dự kiến, thời gian mục tiêu) trong cùng transaction
   * - Lượt tập tạo theo điều kiện tập hiện tại của từng ngựa, như luật của syncParticipants
   * - Ghi nhật ký kèm lớp, trạng thái, nội dung buổi và số lượt đã tạo; buổi chạy thử kèm thời gian mục tiêu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @param body Nội dung buổi tập và môn học của buổi
   * @returns Promise trả về buổi tập vừa tạo ở trạng thái SCHEDULED
   * @throws ForbiddenException Nếu người gọi không quản lý lớp, hoặc có ngựa ngoài khu của Head Trainer
   * @throws NotFoundException Nếu không có lớp
   * @throws ConflictException Nếu lớp đã hoàn thành hoặc đã hủy, môn không có trong giai đoạn chứa ngày của buổi, buổi trùng giờ với buổi chưa hủy khác của lớp, hoặc trùng giờ với lịch ở lớp khác của ngựa đang học lớp vào giờ đó
   * @throws BadRequestException Nếu giờ buổi tập sai hoặc nằm ngoài thời gian của lớp, môn học không tồn tại, loại buổi gửi lên khác loại buổi của môn, hoặc nội dung buổi sai theo loại môn
   */
  async createSession(
    actor: Actor,
    classId: string,
    body: CreateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const trainingClass = await this.lockedManagedClass(
        manager,
        actor,
        caller.id,
        classId,
      );
      return this.createLocked(manager, actor, caller.id, trainingClass, body);
    });
    return toTrainingSessionResponse(row);
  }

  /**
   * Thêm nhiều buổi tập đã lên lịch vào lớp trong một transaction, theo thứ tự giờ bắt đầu
   *
   * - Mỗi buổi áp đúng luật của thêm từng buổi, kể cả trùng giờ với các buổi vừa thêm trước nó
   * - Một buổi lỗi thì không lưu buổi nào; câu báo có tiền tố "Buổi {thứ tự trong body}: " và ô lỗi gắn dưới `sessions.{chỉ số}`
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @param body Các buổi cần thêm
   * @returns Promise trả về các buổi vừa tạo, sớm nhất trước
   * @throws ForbiddenException Nếu người gọi không quản lý lớp, hoặc có ngựa ngoài khu của Head Trainer
   * @throws NotFoundException Nếu không có lớp
   * @throws ConflictException Nếu lớp đã kết thúc, có buổi trùng giờ, hoặc môn không có trong giai đoạn chứa ngày của buổi
   * @throws BadRequestException Nếu có buổi sai giờ, nằm ngoài thời gian của lớp, môn không tồn tại hoặc nội dung sai theo loại môn
   */
  async createSessions(
    actor: Actor,
    classId: string,
    body: CreateTrainingSessionsDto,
  ): Promise<TrainingSessionResponseDto[]> {
    const rows = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const trainingClass = await this.lockedManagedClass(
        manager,
        actor,
        caller.id,
        classId,
      );
      const order = body.sessions
        .map((item, index) => ({ item, index }))
        .sort(
          (a, b) =>
            Date.parse(a.item.scheduledStartAt) -
            Date.parse(b.item.scheduledStartAt),
        );
      const saved: TrainingSessionEntity[] = [];
      for (const { item, index } of order) {
        try {
          saved.push(
            await this.createLocked(
              manager,
              actor,
              caller.id,
              trainingClass,
              item,
            ),
          );
        } catch (error) {
          throw withSessionIndex(error, index);
        }
      }
      return saved;
    });
    return rows.map(toTrainingSessionResponse);
  }

  /**
   * Khóa lớp và kiểm người gọi được thêm buổi vào lớp
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param classId UUID của lớp
   * @returns Promise trả về lớp đã khóa
   * @throws NotFoundException Nếu không có lớp
   * @throws ForbiddenException Nếu người gọi không quản lý lớp
   * @throws ConflictException Nếu lớp đã kết thúc
   */
  private async lockedManagedClass(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    classId: string,
  ): Promise<TrainingClassEntity> {
    const trainingClass = await this.access.lockedTrainingClass(
      manager,
      classId,
    );
    this.access.assertCanManageClass(
      actor,
      callerId,
      trainingClass.headTrainerId,
    );
    assertClassOpenForSessions(trainingClass.status);
    return trainingClass;
  }

  /**
   * Lưu một buổi tập vào lớp đã khóa, kèm cấu hình chạy thử, lượt tập và nhật ký
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param trainingClass Lớp đã khóa, đang chạy
   * @param body Nội dung buổi tập
   * @returns Promise trả về buổi vừa lưu
   * @throws ConflictException Nếu buổi trùng giờ, hoặc môn không có trong giai đoạn chứa ngày của buổi
   * @throws BadRequestException Nếu giờ sai hoặc ngoài thời gian của lớp, môn không tồn tại, loại buổi khác loại của môn, hoặc nội dung sai theo loại môn
   * @throws ForbiddenException Nếu có ngựa ngoài khu của Head Trainer
   */
  private async createLocked(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    trainingClass: TrainingClassEntity,
    body: CreateTrainingSessionDto,
  ): Promise<TrainingSessionEntity> {
    const classId = trainingClass.id;
    assertSessionWindowInClass(
      body.scheduledStartAt,
      body.scheduledEndAt,
      trainingClass.startDate,
      trainingClass.endDate,
    );
    const subject = await manager.findOneBy(TrainingSubjectEntity, {
      id: body.subjectId,
    });
    if (!subject) {
      throw new BadRequestException('Môn học không tồn tại');
    }
    if (body.sessionType && body.sessionType !== subject.sessionType) {
      throw fieldBadRequest(
        'sessionType',
        'Loại buổi phải trùng với loại buổi của môn học',
      );
    }
    await this.assertSubjectInPhase(
      manager,
      trainingClass,
      subject,
      new Date(body.scheduledStartAt),
    );
    const targetTimeMs = body.targetTimeMs ?? null;
    assertSubjectExercise(
      subject.sessionType,
      body.plannedDistanceM,
      targetTimeMs,
    );
    const window = {
      scheduledStartAt: new Date(body.scheduledStartAt),
      scheduledEndAt: new Date(body.scheduledEndAt),
    };
    const classSessions = await manager.find(TrainingSessionEntity, {
      where: { classId, status: Not(TrainingSessionStatus.CANCELLED) },
    });
    assertNoOverlappingClassSession(window, classSessions);
    assertClassDailyLoad(
      trainingClass.code,
      { ...window, intensity: body.intensity },
      classSessions,
    );
    await this.assertHorseSchedule(
      manager,
      classId,
      { ...window, intensity: body.intensity },
      true,
    );
    const session = await manager.save(
      manager.create(TrainingSessionEntity, {
        classId,
        subjectId: subject.id,
        name: body.name,
        sessionType: subject.sessionType,
        intensity: body.intensity,
        plannedDistanceM: body.plannedDistanceM,
        scheduledStartAt: new Date(body.scheduledStartAt),
        scheduledEndAt: new Date(body.scheduledEndAt),
        location: body.location ?? null,
        surface: body.surface ?? null,
        notes: body.notes ?? null,
        status: TrainingSessionStatus.SCHEDULED,
      }),
    );
    if (subject.sessionType === TrainingSessionType.TIME_TRIAL) {
      await manager.save(
        manager.create(TimeTrialEntity, {
          sessionId: session.id,
          distanceM: String(body.plannedDistanceM),
          targetTimeMs: targetTimeMs === null ? null : String(targetTimeMs),
          notes: null,
        }),
      );
    }
    const participantsCreated = await this.syncParticipants(
      manager,
      actor,
      callerId,
      session,
    );
    await this.auditService.record(manager, {
      actorId: callerId,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.TRAINING_SESSION,
      entityId: session.id,
      before: null,
      after: {
        classId,
        status: session.status,
        ...sessionAuditData(session),
        ...(session.sessionType === TrainingSessionType.TIME_TRIAL && {
          targetTimeMs,
        }),
        participantsCreated,
      },
      feature: AuditFeature.TRAIN_SESSION,
    });
    return session;
  }

  /**
   * Sửa buổi tập đã lên lịch chưa tới giờ mở điểm danh (30 phút trước giờ bắt đầu), rồi đồng bộ lại lượt tập
   *
   * - Đổi giờ: kiểm trùng giờ trong lớp và trùng giờ của ngựa như khi thêm buổi
   * - Sau khi lưu, lượt tập được đồng bộ theo giờ bắt đầu và cường độ mới (syncParticipants)
   * - Ghi nhật ký các field nội dung đã đổi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @param body Các field cần sửa
   * @returns Promise trả về buổi tập sau khi sửa
   * @throws ForbiddenException Nếu người gọi không quản lý lớp, hoặc có ngựa ngoài khu của Head Trainer
   * @throws NotFoundException Nếu không có buổi tập hoặc lớp
   * @throws ConflictException Nếu lớp đã kết thúc, buổi không còn đã lên lịch hoặc đã tới giờ mở điểm danh, đổi về buổi thường khi đã có cấu hình chạy thử, môn không có trong giai đoạn chứa ngày của buổi, hoặc trùng giờ
   * @throws BadRequestException Nếu giờ mới nằm ngoài thời gian của lớp hoặc môn học không tồn tại
   */
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
      assertSessionEditable(session, new Date());
      const before = sessionAuditData(session);
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
      const nextSubjectId = body.subjectId ?? session.subjectId;
      const nextSubject = nextSubjectId
        ? await manager.findOneBy(TrainingSubjectEntity, { id: nextSubjectId })
        : null;
      if (body.subjectId && !nextSubject) {
        throw new BadRequestException('Môn học không tồn tại');
      }
      if (
        nextSubject &&
        (nextSubject.id !== session.subjectId ||
          start.getTime() !== session.scheduledStartAt.getTime())
      ) {
        await this.assertSubjectInPhase(
          manager,
          trainingClass,
          nextSubject,
          start,
        );
      }
      const timeChanged =
        start.getTime() !== session.scheduledStartAt.getTime() ||
        end.getTime() !== session.scheduledEndAt.getTime();
      const nextIntensity = body.intensity ?? session.intensity;
      if (timeChanged || nextIntensity !== session.intensity) {
        const classSessions = await manager.find(TrainingSessionEntity, {
          where: {
            classId: session.classId,
            id: Not(sessionId),
            status: Not(TrainingSessionStatus.CANCELLED),
          },
        });
        const next = {
          scheduledStartAt: start,
          scheduledEndAt: end,
          intensity: nextIntensity,
        };
        if (timeChanged) assertNoOverlappingClassSession(next, classSessions);
        assertClassDailyLoad(trainingClass.code, next, classSessions);
        await this.assertHorseSchedule(
          manager,
          session.classId,
          next,
          timeChanged,
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
      const saved = await manager.save(session);
      await this.syncParticipants(manager, actor, caller.id, saved);
      const diff = changedFieldsDiff(before, sessionAuditData(saved));
      if (diff) {
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.TRAINING_SESSION,
          entityId: sessionId,
          ...diff,
          feature: AuditFeature.TRAIN_SESSION,
        });
      }
      return saved;
    });
    return toTrainingSessionResponse(row);
  }

  /**
   * Head Trainer của lớp hủy một buổi tập kèm lý do
   *
   * - Còn lượt Đang tập: 409
   * - Lượt chưa diễn ra (Chờ điểm danh, Có mặt, Sẵn sàng) chuyển Đã hủy với cùng lý do
   * - Có lượt vừa bị hủy: ghi TRAINING_SESSION_CANCELLED_EVENT vào outbox để báo người dắt từng ngựa
   * - Ghi nhật ký trạng thái trước và sau kèm lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @param body Lý do hủy
   * @returns Promise trả về buổi tập sau khi hủy
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc người gọi không quản lý lớp của buổi
   * @throws NotFoundException Nếu không có buổi tập hoặc lớp
   * @throws ConflictException Nếu buổi không còn hủy được, hoặc còn lượt Đang tập
   */
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
      const previousStatus = session.status;
      const ongoing = await manager.countBy(SessionParticipantEntity, {
        sessionId,
        status: SessionParticipantStatus.ONGOING,
      });
      if (ongoing)
        throw new ConflictException(
          'Không thể hủy buổi tập khi còn lượt tập đang tập',
        );
      const cancelledRuns = await manager.find(SessionParticipantEntity, {
        where: { sessionId, status: In(CANCELLABLE_RUN_STATUSES) },
        select: { horseId: true, assignedGroomId: true },
      });
      await manager
        .createQueryBuilder()
        .update(SessionParticipantEntity)
        .set({
          status: SessionParticipantStatus.CANCELLED,
          cancelReason: body.reason,
        })
        .where('session_id = :sessionId', { sessionId })
        .andWhere('status IN (:...statuses)', {
          statuses: CANCELLABLE_RUN_STATUSES,
        })
        .execute();
      session.status = TrainingSessionStatus.CANCELLED;
      session.cancelledAt = new Date();
      session.cancelledBy = caller.id;
      session.cancelReason = body.reason;
      const saved = await manager.save(session);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TRAINING_SESSION,
        entityId: sessionId,
        before: { status: previousStatus },
        after: { status: saved.status },
        reason: body.reason,
        feature: AuditFeature.TRAIN_SESSION,
      });
      if (cancelledRuns.length > 0) {
        const event: TrainingSessionCancelledEvent = {
          eventId: randomUUID(),
          sessionId,
          sessionName: saved.name,
          scheduledStartAt: saved.scheduledStartAt.toISOString(),
          reason: body.reason,
          runs: cancelledRuns.map((run) => ({
            horseId: run.horseId,
            groomId: run.assignedGroomId,
          })),
        };
        await this.events.publish(
          manager,
          TRAINING_SESSION_CANCELLED_EVENT,
          event,
        );
      }
      return saved;
    });
    return toTrainingSessionResponse(row);
  }

  /**
   * Chặn buổi tập của lớp vướng lịch ở lớp khác của những ngựa đang học lớp vào giờ đó
   *
   * - Ngựa xét: có khoảng ghi danh chưa hủy ở lớp chứa giờ bắt đầu của buổi
   * - Khóa các ngựa xét trước khi đọc lịch
   * - Lịch xét: lịch của ngựa ở lớp khác và buổi ngựa đang giữ chỗ ở lớp khác
   * - Kiểm trùng giờ trước (nếu checkClash), rồi giới hạn tập trong ngày (findDailyLoadConflict)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param classId UUID của lớp
   * @param session Khoảng giờ và cường độ của buổi đang thêm hoặc sửa
   * @param checkClash Có kiểm trùng giờ không; sửa buổi không đổi giờ thì không kiểm
   * @returns Promise hoàn tất khi không ngựa nào vướng
   * @throws ConflictException Nếu có ngựa bị trùng giờ hoặc vượt giới hạn tập trong ngày; câu báo liệt kê mọi ngựa vướng kèm mã lớp và giờ bắt đầu của buổi gây vướng
   */
  private async assertHorseSchedule(
    manager: EntityManager,
    classId: string,
    session: SessionWindow & { intensity: TrainingIntensity },
    checkClash: boolean,
  ): Promise<void> {
    const horseIds = (
      await this.enrollmentsAt(manager, classId, session.scheduledStartAt)
    ).map((enrollment) => enrollment.horseId);
    if (horseIds.length === 0) return;
    await this.access.lockHorses(manager, horseIds);
    const others = [
      ...(await this.access.horseScheduledSessionsInOtherClasses(
        manager,
        horseIds,
        classId,
      )),
      ...(await this.access.horseSessionHoldings(manager, horseIds, classId)),
    ];
    const clashes = checkClash ? findHorseScheduleClashes(session, others) : [];
    if (clashes.length > 0) {
      throw horseScheduleClashError(
        clashes,
        await this.access.horseBriefs(
          clashes.map((clash) => clash.horseId),
          manager,
        ),
      );
    }
    const overloaded = [...sessionsByHorse(others)].flatMap(
      ([horseId, own]) => {
        const conflict = findDailyLoadConflict(session, own);
        return conflict ? [{ horseId, conflict }] : [];
      },
    );
    if (overloaded.length > 0) {
      throw horseDailyLoadError(
        overloaded,
        await this.access.horseBriefs(
          overloaded.map((item) => item.horseId),
          manager,
        ),
      );
    }
  }

  /**
   * Lấy các khoảng ghi danh chưa hủy của lớp chứa một thời điểm
   *
   * @param manager EntityManager của transaction đang chạy
   * @param classId UUID của lớp
   * @param at Thời điểm cần xét, thường là giờ bắt đầu của buổi
   * @returns Promise trả về các khoảng ghi danh có enrolledAt <= at và chưa rời lớp tại at, sắp theo UUID ngựa
   */
  private enrollmentsAt(
    manager: EntityManager,
    classId: string,
    at: Date,
  ): Promise<HorseEnrollmentEntity[]> {
    return manager
      .getRepository(HorseEnrollmentEntity)
      .createQueryBuilder('enrollment')
      .where('enrollment.class_id = :classId', { classId })
      .andWhere('enrollment.status <> :cancelledStatus', {
        cancelledStatus: HorseEnrollmentStatus.CANCELLED,
      })
      .andWhere('enrollment.enrolled_at <= :scheduledStartAt', {
        scheduledStartAt: at,
      })
      .andWhere(
        '(enrollment.left_at IS NULL OR :scheduledStartAt < enrollment.left_at)',
        { scheduledStartAt: at },
      )
      .orderBy('enrollment.horse_id', 'ASC')
      .getMany();
  }

  /**
   * Chặn buổi dùng môn không có trong giai đoạn của lớp chứa ngày bắt đầu của buổi
   *
   * - Ngày tính theo lịch CLB; giai đoạn lấy từ giáo án của lớp
   *
   * @param manager EntityManager của transaction đang chạy
   * @param trainingClass Lớp của buổi
   * @param subject Môn của buổi
   * @param startAt Giờ bắt đầu của buổi
   * @returns Promise hoàn tất khi môn hợp lệ
   * @throws ConflictException Nếu môn không có trong giai đoạn chứa ngày của buổi
   */
  private async assertSubjectInPhase(
    manager: EntityManager,
    trainingClass: TrainingClassEntity,
    subject: TrainingSubjectEntity,
    startAt: Date,
  ): Promise<void> {
    const phase = classPhaseOn(
      trainingClass.startDate,
      await manager.find(TrainingClassPhaseEntity, {
        where: { classId: trainingClass.id },
        relations: { subjects: true },
      }),
      toClubDate(startAt),
    );
    if (!phase?.subjects.some((item) => item.subjectId === subject.id)) {
      throw new ConflictException(
        `Môn ${subject.name} không có trong giai đoạn ${phase?.position ?? '?'} của lớp`,
      );
    }
  }

  /**
   * Đồng bộ lượt tập của một buổi đã lên lịch với các ngựa đang học lớp vào giờ bắt đầu của buổi
   *
   * - Ngựa có khoảng ghi danh chưa hủy chứa giờ bắt đầu mà chưa có lượt: tạo lượt mới; lượt cũ đã hủy thì dùng lại và đặt lại như lượt mới
   * - Lượt chờ điểm danh, hủy do khóa, không đủ điều kiện: chấm lại điều kiện tập theo cường độ của buổi; lượt đã có người dắt giữ người dắt, lượt chưa có người dắt gắn Groom phụ trách ngựa lúc bắt đầu
   * - Lượt mới hoặc dùng lại: gắn Groom phụ trách ngựa lúc bắt đầu
   * - Người dắt của lượt còn mở đang dắt lượt khác trùng giờ ở buổi khác: 409 (assertNoGroomRunClashes)
   * - Lượt chờ điểm danh, hủy do khóa, không đủ điều kiện của ngựa không còn học lớp vào giờ bắt đầu: hủy
   * - Lượt đã điểm danh trở đi giữ nguyên
   * - Khóa từng con ngựa theo thứ tự UUID, rồi khóa user các Groom làm người dắt theo thứ tự UUID, rồi mới ghi lượt
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param session Buổi tập đã khóa và đã lưu
   * @returns Promise trả về số lượt mới tạo hoặc dùng lại
   * @throws ForbiddenException Nếu Head Trainer gặp ngựa ngoài khu mình phụ trách
   * @throws ConflictException Nếu người dắt của một lượt bị trùng giờ với lượt khác đang dắt
   */
  private async syncParticipants(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    session: TrainingSessionEntity,
  ): Promise<number> {
    const enrollments = new Map(
      (
        await this.enrollmentsAt(
          manager,
          session.classId,
          session.scheduledStartAt,
        )
      ).map((enrollment) => [enrollment.horseId, enrollment]),
    );
    const participants = new Map(
      (
        await manager.find(SessionParticipantEntity, {
          where: { sessionId: session.id },
        })
      ).map((participant) => [participant.horseId, participant]),
    );
    const horseIds = [
      ...new Set([...enrollments.keys(), ...participants.keys()]),
    ].sort();
    let created = 0;
    const writes: SessionParticipantEntity[] = [];
    const assigned: Array<{ groomId: string; run: GroomRun }> = [];
    for (const horseId of horseIds) {
      const participant = participants.get(horseId);
      const reusable =
        !participant ||
        participant.status === SessionParticipantStatus.CANCELLED;
      if (
        participant &&
        !reusable &&
        !SYNCED_PARTICIPANT_STATUSES.includes(participant.status)
      ) {
        continue;
      }
      const enrollment = enrollments.get(horseId);
      if (!enrollment) {
        if (participant && !reusable) {
          Object.assign(participant, {
            status: SessionParticipantStatus.CANCELLED,
            cancelReason: NOT_ENROLLED_AT_START_REASON,
            ineligibilityReason: null,
          });
          writes.push(participant);
        }
        continue;
      }
      const horse = await this.access.lockedHorse(manager, horseId);
      await this.access.assertTrainerBarn(manager, actor, callerId, horseId);
      const activeLock = await manager.existsBy(TrainingLockEntity, {
        horseId,
        status: TrainingLockStatus.ACTIVE,
      });
      const eligibility = eligibilityForSession(
        evaluateEligibility({
          isDeleted: Boolean(horse.deletedAt),
          lifecycleStatus: horse.lifecycleStatus,
          healthStatus: horse.healthStatus,
          hasActiveTrainingLock: activeLock,
        }),
        session.intensity,
      );
      const groomId =
        (!reusable && participant?.assignedGroomId) ||
        ((await this.findGroomAt(manager, horseId, session.scheduledStartAt))
          ?.groomId ??
          null);
      const row =
        participant ??
        manager.create(SessionParticipantEntity, {
          sessionId: session.id,
          horseId,
        });
      if (reusable) created += 1;
      writes.push(
        Object.assign(row, {
          horseEnrollmentId: enrollment.id,
          assignedGroomId: groomId,
          ...(reusable && {
            checkedInAt: null,
            startedAt: null,
            completedAt: null,
            absenceReason: null,
          }),
          cancelReason: null,
          ...initialParticipantEligibility(eligibility, activeLock),
        }),
      );
      if (groomId) {
        assigned.push({
          groomId,
          run: {
            sessionId: session.id,
            status: row.status,
            sessionStatus: session.status,
            sessionName: session.name,
            horseName: horse.name,
            scheduledStartAt: session.scheduledStartAt,
            scheduledEndAt: session.scheduledEndAt,
          },
        });
      }
    }
    await this.access.lockUsers(
      manager,
      assigned.map(({ groomId }) => groomId),
    );
    for (const row of writes) await manager.save(row);
    assertNoGroomRunClashes(
      await this.access.groomRunClashes(manager, assigned),
    );
    return created;
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

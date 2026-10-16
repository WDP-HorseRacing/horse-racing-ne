import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
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
  TrainingSessionResponseDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { toTrainingSessionResponse } from '../mappers/training-session.mapper';
import {
  assertNoOverlappingClassSession,
  assertSessionCancellable,
  assertSessionEditable,
  assertClassOpenForSessions,
  assertSessionWindowInClass,
  assertSubjectExercise,
  eligibilityForSession,
  findHorseScheduleClashes,
  horseScheduleClashError,
  initialParticipantEligibility,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import { sessionAuditData } from '../utils/training-audit';
import type { SessionWindow } from '../types/training-session.types';

/**
 * Lượt tập được đồng bộ lại khi buổi đổi giờ hoặc cường độ
 */
const SYNCED_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.CANCELLED_BY_LOCK,
  SessionParticipantStatus.INELIGIBLE,
];

/**
 * Lượt tập đã điểm danh trở đi, chặn sửa buổi
 */
const CHECKED_IN_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
  SessionParticipantStatus.ONGOING,
];

const NOT_ENROLLED_AT_START_REASON = 'Ngựa không học lớp vào giờ mới của buổi';

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectRepository(TrainingSessionEntity)
    private readonly sessions: Repository<TrainingSessionEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
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
   * @throws ConflictException Nếu lớp đã hoàn thành hoặc đã hủy, buổi trùng giờ với buổi chưa hủy khác của lớp, hoặc trùng giờ với lịch ở lớp khác của ngựa đang học lớp vào giờ đó
   * @throws BadRequestException Nếu giờ buổi tập sai hoặc nằm ngoài thời gian của lớp, môn học không tồn tại, loại buổi gửi lên khác loại buổi của môn, hoặc nội dung buổi sai theo loại môn
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
      assertNoOverlappingClassSession(
        window,
        await manager.find(TrainingSessionEntity, {
          where: { classId, status: Not(TrainingSessionStatus.CANCELLED) },
        }),
      );
      await this.assertNoHorseScheduleClash(manager, classId, window);
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
        caller.id,
        session,
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
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
    });
    return toTrainingSessionResponse(row);
  }

  /**
   * Sửa buổi tập đã lên lịch chưa tới giờ bắt đầu, rồi đồng bộ lại lượt tập
   *
   * - Chặn khi đã có ngựa điểm danh, sẵn sàng hoặc đang tập
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
   * @throws ConflictException Nếu lớp đã kết thúc, buổi không còn đã lên lịch hoặc đã tới giờ, đã có ngựa điểm danh, đổi về buổi thường khi đã có cấu hình chạy thử, hoặc trùng giờ
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
      if (
        await manager.existsBy(SessionParticipantEntity, {
          sessionId,
          status: In(CHECKED_IN_PARTICIPANT_STATUSES),
        })
      ) {
        throw new ConflictException(
          'Buổi tập đã có ngựa điểm danh, không sửa được',
        );
      }
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
      if (
        start.getTime() !== session.scheduledStartAt.getTime() ||
        end.getTime() !== session.scheduledEndAt.getTime()
      ) {
        await this.assertNoHorseScheduleClash(manager, session.classId, {
          scheduledStartAt: start,
          scheduledEndAt: end,
        });
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
      return saved;
    });
    return toTrainingSessionResponse(row);
  }

  /**
   * Chặn buổi tập của lớp trùng giờ với lịch ở lớp khác của những ngựa đang học lớp vào giờ đó
   *
   * - Ngựa xét: có khoảng ghi danh chưa hủy ở lớp chứa giờ bắt đầu của buổi
   * - Khóa các ngựa xét trước khi đọc lịch
   * - Trùng khi buổi chồng giờ với lịch của ngựa ở lớp khác hoặc với buổi ngựa đang giữ chỗ ở lớp khác
   *
   * @param manager EntityManager của transaction đang chạy
   * @param classId UUID của lớp
   * @param window Khoảng giờ của buổi đang thêm hoặc sửa
   * @returns Promise hoàn tất khi không ngựa nào bị trùng giờ
   * @throws ConflictException Nếu có ngựa bị trùng giờ; câu báo liệt kê mọi ngựa trùng kèm mã lớp và giờ bắt đầu của buổi trùng
   */
  private async assertNoHorseScheduleClash(
    manager: EntityManager,
    classId: string,
    window: SessionWindow,
  ): Promise<void> {
    const horseIds = (
      await this.enrollmentsAt(manager, classId, window.scheduledStartAt)
    ).map((enrollment) => enrollment.horseId);
    if (horseIds.length === 0) return;
    await this.access.lockHorses(manager, horseIds);
    const clashes = findHorseScheduleClashes(window, [
      ...(await this.access.horseScheduledSessionsInOtherClasses(
        manager,
        horseIds,
        classId,
      )),
      ...(await this.access.horseSessionHoldings(manager, horseIds, classId)),
    ]);
    if (clashes.length > 0) {
      throw horseScheduleClashError(
        clashes,
        await this.access.horseBriefs(
          clashes.map((clash) => clash.horseId),
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
   * Đồng bộ lượt tập của một buổi đã lên lịch với các ngựa đang học lớp vào giờ bắt đầu của buổi
   *
   * - Ngựa có khoảng ghi danh chưa hủy chứa giờ bắt đầu mà chưa có lượt: tạo lượt mới; lượt cũ đã hủy thì dùng lại và đặt lại như lượt mới
   * - Lượt chờ điểm danh, hủy do khóa, không đủ điều kiện: chấm lại điều kiện tập theo cường độ của buổi, gắn Groom phụ trách ngựa lúc bắt đầu
   * - Lượt chờ điểm danh, hủy do khóa, không đủ điều kiện của ngựa không còn học lớp vào giờ bắt đầu: hủy
   * - Lượt đã điểm danh trở đi giữ nguyên
   * - Khóa từng con ngựa theo thứ tự UUID trước khi ghi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param session Buổi tập đã khóa và đã lưu
   * @returns Promise trả về số lượt mới tạo hoặc dùng lại
   * @throws ForbiddenException Nếu Head Trainer gặp ngựa ngoài khu mình phụ trách
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
          await manager.save(participant);
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
      const groom = await this.findGroomAt(
        manager,
        horseId,
        session.scheduledStartAt,
      );
      const row =
        participant ??
        manager.create(SessionParticipantEntity, {
          sessionId: session.id,
          horseId,
        });
      if (reusable) created += 1;
      await manager.save(
        Object.assign(row, {
          horseEnrollmentId: enrollment.id,
          assignedGroomId: groom?.groomId ?? null,
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
    }
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

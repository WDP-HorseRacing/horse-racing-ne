import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import type { Actor } from '../../../../common/types/actor';
import { AuditAction } from '../../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../../audit/constants/audit-feature.enum';
import { AuditService } from '../../../audit/services/audit.service';
import {
  clubDateTimeToInstant,
  shiftDays,
} from '../../../../common/utils/club-date';
import { GroomAssignmentEntity } from '../../../stable/entities/groom-assignment.entity';
import { TrainingLockEntity } from '../../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../../medical/constants/training-lock.enum';
import { HorseEntity } from '../../../horses/entities/horse.entity';
import { HorseLifecycleStatus } from '../../../horses/enums/horse-status.enum';
import { MediaService } from '../../../media/services/media.service';
import { evaluateEligibility } from '../../../horses/policies/horse.policy';
import {
  CreateHorseEnrollmentDto,
  EnrollableHorseDto,
  HorseEnrollmentListItemDto,
  HorseEnrollmentResponseDto,
  LeaveHorseEnrollmentDto,
} from '../../dto/horse-enrollment.dto';
import { SessionParticipantStatus } from '../../enums/session-participant-status.enum';
import { HorseEnrollmentStatus } from '../../enums/horse-enrollment-status.enum';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../../enums/training-session-status.enum';
import { HorseEnrollmentEntity } from '../../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { TrainingSessionEntity } from '../../entities/training-session.entity';
import {
  toEnrollableHorse,
  toHorseEnrollmentListItem,
  toHorseEnrollmentResponse,
} from '../../mappers/horse-enrollment.mapper';
import { TrainingAccessService } from '../../shared/training-access.service';
import {
  assertHorseEnrollable,
  assertNoHoldingOverlap,
  HORSE_SCHEDULE_SESSION_STATUSES,
  eligibilityForSession,
  findDailyLoadConflict,
  horseDailyLoadError,
  horsesClashingWithClass,
  sessionsByHorse,
  initialParticipantEligibility,
} from '../../policies/training.policy';
import { TrainingOperationsFacade } from '../../shared/training-operations.facade';
import { horseListDisplay } from '../../utils/horse-list-display';

@Injectable()
export class TrainingClassEnrollmentsService {
  constructor(
    @InjectRepository(HorseEnrollmentEntity)
    private readonly enrollments: Repository<HorseEnrollmentEntity>,
    private readonly access: TrainingAccessService,
    private readonly operations: TrainingOperationsFacade,
    private readonly dataSource: DataSource,
    private readonly media: MediaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Liệt kê các lượt ghi danh của lớp mà người gọi được xem, mỗi lượt kèm tên và ảnh ngựa
   *
   * - Tên ngựa vẫn hiện khi hồ sơ ngựa đã xóa mềm
   * - Ảnh ngựa chỉ ký link sau khi đã lọc các lượt người gọi được xem
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @returns Promise trả về các lượt ghi danh theo thứ tự ghi danh
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lớp hoặc lớp nằm ngoài phạm vi xem của người gọi
   */
  async list(
    actor: Actor,
    classId: string,
  ): Promise<HorseEnrollmentListItemDto[]> {
    const caller = await this.access.currentUser(actor);
    await this.access.assertCanReadClass(actor, classId);
    const rows = await this.enrollments.find({
      where: { classId },
      relations: { trainingClass: true },
      order: { enrolledAt: 'ASC' },
    });
    const visible = await Promise.all(
      rows.map(async (row) =>
        (await this.access.canReadEnrollment(
          actor,
          caller.id,
          row,
          this.dataSource.manager,
        ))
          ? row
          : null,
      ),
    );
    const shown = visible.filter((row): row is HorseEnrollmentEntity => !!row);
    const briefs = await this.access.horseBriefs(
      shown.map((row) => row.horseId),
    );
    const photoUrls = await this.media.signDownloadUrls(
      [...briefs.values()]
        .map((brief) => brief.mediaId)
        .filter((id): id is string => id !== null),
    );
    return shown.map((row) =>
      toHorseEnrollmentListItem(
        row,
        horseListDisplay(row.horseId, briefs, photoUrls),
      ),
    );
  }

  async create(
    actor: Actor,
    classId: string,
    body: CreateHorseEnrollmentDto,
  ): Promise<HorseEnrollmentResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
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
      if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Chỉ lớp đang chạy mới nhận thêm ngựa');
      }
      if (trainingClass.maxHorses) {
        const activeCount = await manager.count(HorseEnrollmentEntity, {
          where: {
            classId,
            status: HorseEnrollmentStatus.ACTIVE,
          },
        });
        if (activeCount >= trainingClass.maxHorses) {
          throw new ConflictException(
            `Lớp học đã đạt sĩ số tối đa (${trainingClass.maxHorses} ngựa)`,
          );
        }
      }
      const horse = await this.access.lockedHorse(manager, body.horseId);
      await this.access.assertTrainerBarn(manager, actor, caller.id, horse.id);
      assertHorseEnrollable(horse.lifecycleStatus);
      const enrolledAt = body.enrolledAt
        ? new Date(body.enrolledAt)
        : new Date();
      if (
        enrolledAt < clubDateTimeToInstant(trainingClass.startDate, '00:00') ||
        enrolledAt >=
          clubDateTimeToInstant(shiftDays(trainingClass.endDate, 1), '00:00')
      ) {
        throw new ConflictException(
          'Thời điểm ghi danh phải nằm trong thời gian của lớp',
        );
      }
      const existingPeriods = await manager.find(HorseEnrollmentEntity, {
        where: {
          classId,
          horseId: body.horseId,
          status: Not(HorseEnrollmentStatus.CANCELLED),
        },
      });
      if (
        existingPeriods.some(
          (period) => !period.leftAt || enrolledAt < period.leftAt,
        )
      ) {
        throw new ConflictException('Khoảng ghi danh của ngựa bị chồng lấn');
      }
      const row = await manager.save(
        manager.create(HorseEnrollmentEntity, {
          classId,
          horseId: horse.id,
          enrolledAt,
          leftAt: null,
          status: HorseEnrollmentStatus.ACTIVE,
        }),
      );
      await this.addToFuturePublishedSessions(manager, row, horse);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.CLASS_ENROLLMENT,
        entityId: row.id,
        before: null,
        after: {
          classId,
          horseId: horse.id,
          enrolledAt: enrolledAt.toISOString(),
        },
        feature: AuditFeature.TRAIN_ENROLL,
      });
      return row;
    });
    return toHorseEnrollmentResponse(saved);
  }

  /**
   * Liệt kê các ngựa Head Trainer của lớp ghi danh được vào lớp ngay lúc này, mỗi ngựa kèm tên và ảnh
   *
   * - Ngựa xét: thuộc khu do người gọi phụ trách, đang hoạt động, chưa xóa
   * - Bỏ ngựa đang có khoảng ghi danh mở ở lớp này
   * - Bỏ ngựa trùng giờ với lớp khác hoặc vượt giới hạn tập trong ngày theo đúng luật ghi danh
   * - Không xét sĩ số của lớp
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @returns Promise trả về các ngựa theo tên
   * @throws ForbiddenException Nếu tài khoản không hoạt động, người gọi không phải Head Trainer của lớp hoặc lớp chưa có Head Trainer
   * @throws NotFoundException Nếu không có lớp
   * @throws ConflictException Nếu lớp không ở trạng thái đang chạy
   */
  async listEnrollableHorses(
    actor: Actor,
    classId: string,
  ): Promise<EnrollableHorseDto[]> {
    const manager = this.dataSource.manager;
    const caller = await this.access.currentUser(actor, manager);
    const trainingClass = await this.access.findTrainingClass(manager, classId);
    this.access.assertCanManageClass(
      actor,
      caller.id,
      trainingClass.headTrainerId,
    );
    if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
      throw new ConflictException('Chỉ lớp đang chạy mới nhận thêm ngựa');
    }
    const now = new Date();
    const horses = await manager.find(HorseEntity, {
      where: {
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        barn: { headTrainerId: caller.id },
      },
      order: { name: 'ASC' },
    });
    if (horses.length === 0) return [];
    const enrolled = await manager.find(HorseEnrollmentEntity, {
      where: {
        classId,
        horseId: In(horses.map((horse) => horse.id)),
        status: Not(HorseEnrollmentStatus.CANCELLED),
      },
    });
    const enrolledIds = new Set(
      enrolled
        .filter((period) => !period.leftAt || now < period.leftAt)
        .map((period) => period.horseId),
    );
    const candidates = horses.filter((horse) => !enrolledIds.has(horse.id));
    if (candidates.length === 0) return [];
    const candidateIds = candidates.map((horse) => horse.id);
    const schedule = await this.upcomingSchedule(manager, classId, now);
    const holdings = await this.access.horseSessionHoldings(
      manager,
      candidateIds,
      classId,
    );
    const otherSchedule =
      await this.access.horseScheduledSessionsInOtherClasses(
        manager,
        candidateIds,
        classId,
      );
    const clashing = horsesClashingWithClass(
      schedule.filter(
        (session) => session.status === TrainingSessionStatus.SCHEDULED,
      ),
      schedule,
      holdings,
      otherSchedule,
    );
    const othersByHorse = sessionsByHorse([...holdings, ...otherSchedule]);
    const shown = candidates.filter(
      (horse) =>
        !clashing.has(horse.id) &&
        !schedule.some((session) =>
          findDailyLoadConflict(session, othersByHorse.get(horse.id) ?? []),
        ),
    );
    const photoUrls = await this.media.signDownloadUrls(
      shown
        .map((horse) => horse.mediaId)
        .filter((id): id is string => id !== null),
    );
    const briefs = new Map(
      shown.map((horse) => [
        horse.id,
        { name: horse.name, mediaId: horse.mediaId },
      ]),
    );
    return shown.map((horse) =>
      toEnrollableHorse(
        horse.id,
        horseListDisplay(horse.id, briefs, photoUrls),
      ),
    );
  }

  async leave(
    actor: Actor,
    enrollmentId: string,
    body: LeaveHorseEnrollmentDto,
  ): Promise<HorseEnrollmentResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const row = await manager.findOne(HorseEnrollmentEntity, {
        where: { id: enrollmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new ConflictException('Không tìm thấy ghi danh của ngựa');
      const trainingClass = await this.access.findTrainingClass(
        manager,
        row.classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      if (row.status !== HorseEnrollmentStatus.ACTIVE) {
        throw new ConflictException('Ngựa đã rời lớp');
      }
      const leftAt = body.leftAt ? new Date(body.leftAt) : new Date();
      if (leftAt < row.enrolledAt) {
        throw new ConflictException('Thời điểm rời lớp không hợp lệ');
      }
      if (
        leftAt >=
        clubDateTimeToInstant(shiftDays(trainingClass.endDate, 1), '00:00')
      ) {
        throw new ConflictException(
          'Thời điểm rời lớp phải nằm trong thời gian của lớp',
        );
      }
      row.leftAt = leftAt;
      row.status = HorseEnrollmentStatus.LEFT;
      const updated = await manager.save(row);
      await this.operations.cancelParticipantsFromEnrollments(
        manager,
        [enrollmentId],
        leftAt,
        body.reason ?? 'Ngựa đã rời lớp',
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.CLASS_ENROLLMENT,
        entityId: enrollmentId,
        before: { status: HorseEnrollmentStatus.ACTIVE },
        after: { status: updated.status, leftAt: leftAt.toISOString() },
        reason: body.reason ?? null,
        feature: AuditFeature.TRAIN_ENROLL,
      });
      return updated;
    });
    return toHorseEnrollmentResponse(saved);
  }

  /**
   * Thêm ngựa vào các buổi đã công bố chưa tới giờ của lớp kể từ lúc ghi danh
   *
   * - Từ chối cả lần ghi danh nếu ngựa đang giữ buổi ở lớp khác trùng giờ với một buổi đã công bố
   * - Từ chối cả lần ghi danh nếu lịch của ngựa ở lớp này (buổi SCHEDULED, IN_PROGRESS chưa tới giờ, kể từ lúc ghi danh) trùng giờ với lịch của ngựa ở lớp khác
   * - Từ chối cả lần ghi danh nếu một buổi trong lịch đó vượt giới hạn tập trong ngày so với lịch và buổi giữ chỗ của ngựa ở lớp khác
   * - Buổi chưa có lượt của ngựa: tạo lượt mới theo điều kiện huấn luyện hiện tại
   * - Buổi có lượt cũ CANCELLED (do rời lớp): dùng lại lượt đó, gắn ghi danh mới và đặt lại như lượt mới tạo
   * - Buổi có lượt cũ ở trạng thái khác: giữ nguyên
   *
   * @param manager EntityManager của transaction đang chạy
   * @param enrollment Lượt ghi danh vừa tạo
   * @param horse Ngựa được ghi danh, đã khóa
   * @returns Promise hoàn tất khi các lượt tham gia đã được lưu
   * @throws ConflictException Nếu ngựa đã có buổi tập trùng giờ ở lớp khác, hoặc vượt giới hạn tập trong ngày
   */
  private async addToFuturePublishedSessions(
    manager: EntityManager,
    enrollment: HorseEnrollmentEntity,
    horse: HorseEntity,
  ): Promise<void> {
    const schedule = await this.upcomingSchedule(
      manager,
      enrollment.classId,
      enrollment.enrolledAt,
    );
    const sessions = schedule.filter(
      (session) => session.status === TrainingSessionStatus.SCHEDULED,
    );
    const holdings = await this.access.horseSessionHoldings(
      manager,
      [horse.id],
      enrollment.classId,
    );
    const otherSchedule =
      await this.access.horseScheduledSessionsInOtherClasses(
        manager,
        [horse.id],
        enrollment.classId,
      );
    assertNoHoldingOverlap(horse.name, sessions, holdings);
    assertNoHoldingOverlap(horse.name, schedule, otherSchedule);
    const others =
      sessionsByHorse([...holdings, ...otherSchedule]).get(horse.id) ?? [];
    for (const session of schedule) {
      const conflict = findDailyLoadConflict(session, others);
      if (conflict) {
        throw horseDailyLoadError(
          [{ horseId: horse.id, conflict }],
          new Map([[horse.id, { name: horse.name, mediaId: horse.mediaId }]]),
        );
      }
    }
    for (const session of sessions) {
      const exists = await manager.findOneBy(SessionParticipantEntity, {
        sessionId: session.id,
        horseId: horse.id,
      });
      if (exists && exists.status !== SessionParticipantStatus.CANCELLED) {
        continue;
      }
      const lock = await manager.findOneBy(TrainingLockEntity, {
        horseId: horse.id,
        status: TrainingLockStatus.ACTIVE,
      });
      const eligibility = eligibilityForSession(
        evaluateEligibility({
          isDeleted: Boolean(horse.deletedAt),
          lifecycleStatus: horse.lifecycleStatus,
          healthStatus: horse.healthStatus,
          hasActiveTrainingLock: !!lock,
        }),
        session.intensity,
      );
      const groom = await this.findGroomAt(
        manager,
        horse.id,
        session.scheduledStartAt,
      );
      const participant =
        exists ??
        manager.create(SessionParticipantEntity, {
          sessionId: session.id,
          horseId: horse.id,
        });
      await manager.save(
        Object.assign(participant, {
          horseEnrollmentId: enrollment.id,
          assignedGroomId: groom?.groomId ?? null,
          checkedInAt: null,
          startedAt: null,
          completedAt: null,
          absenceReason: null,
          cancelReason: null,
          ...initialParticipantEligibility(eligibility, !!lock),
        }),
      );
    }
  }

  /**
   * Lấy lịch còn tới của lớp tính từ một thời điểm
   *
   * - Buổi nháp, đã công bố, đang diễn ra, bắt đầu sau hiện tại và không trước thời điểm from
   *
   * @param manager EntityManager dùng để query
   * @param classId UUID của lớp
   * @param from Thời điểm bắt đầu xét, thường là lúc ghi danh
   * @returns Promise trả về các buổi sớm nhất trước
   */
  private upcomingSchedule(
    manager: EntityManager,
    classId: string,
    from: Date,
  ): Promise<TrainingSessionEntity[]> {
    return manager
      .getRepository(TrainingSessionEntity)
      .createQueryBuilder('session')
      .where('session.class_id = :classId', { classId })
      .andWhere('session.status IN (:...statuses)', {
        statuses: HORSE_SCHEDULE_SESSION_STATUSES,
      })
      .andWhere('session.scheduled_start_at >= :from', { from })
      .andWhere('session.scheduled_start_at > :now', { now: new Date() })
      .orderBy('session.scheduled_start_at', 'ASC')
      .getMany();
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

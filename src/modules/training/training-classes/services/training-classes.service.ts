import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import type { Actor } from '../../../../common/types/actor';
import {
  clubDateTimeToInstant,
  clubToday,
  shiftDays,
  toClubDate,
} from '../../../../common/utils/club-date';
import { fieldConflict } from '../../../../common/utils/field-errors';
import { changedFieldsDiff } from '../../../../common/utils/record-diff';
import { AuditAction } from '../../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../../audit/constants/audit-feature.enum';
import { AuditService } from '../../../audit/services/audit.service';
import {
  CreateTrainingClassDto,
  TrainingClassPlanResponseDto,
  TrainingClassProgressResponseDto,
  TrainingClassResponseDto,
  UpdateTrainingClassStatusDto,
  UpdateTrainingClassDto,
} from '../../dto/training-class.dto';
import { HorseEnrollmentStatus } from '../../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../../enums/training-session-status.enum';
import { HorseEnrollmentEntity } from '../../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { TrainingClassPhaseSubjectEntity } from '../../entities/training-class-phase-subject.entity';
import { TrainingClassPhaseEntity } from '../../entities/training-class-phase.entity';
import { TrainingClassEntity } from '../../entities/training-class.entity';
import { TrainingPlanPhaseEntity } from '../../entities/training-plan-phase.entity';
import { TrainingPlanEntity } from '../../entities/training-plan.entity';
import { TrainingSessionEntity } from '../../entities/training-session.entity';
import {
  classWeeklyProgress,
  phaseMinMinutes,
} from '../../policies/training-plan.policy';
import {
  toTrainingClassPlanResponse,
  toTrainingClassProgressResponse,
  toTrainingClassResponse,
} from '../../mappers/training-class.mapper';
import {
  assertClassCancellable,
  assertClassEditable,
  assertClassStartNotPast,
  classEndDate,
  totalPlanWeeks,
} from '../../policies/training.policy';
import { TrainingAccessService } from '../../shared/training-access.service';
import { completeTrainingClass } from '../../shared/training-class-completion';
import { classAuditData } from '../../utils/training-audit';

@Injectable()
export class TrainingClassesService {
  constructor(
    @InjectRepository(TrainingClassEntity)
    private readonly classes: Repository<TrainingClassEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Head Trainer tạo lớp đang chạy do mình phụ trách theo giáo án của mình, trong một transaction
   *
   * - Lớp chép các giai đoạn và môn của giáo án lúc tạo; sửa giáo án sau đó không đổi lớp
   * - Ngày bắt đầu không được trước hôm nay theo lịch CLB
   * - Ngày kết thúc = ngày bắt đầu + tổng số tuần của giáo án
   * - Không tạo buổi tập; Head Trainer xếp buổi sau khi tạo lớp
   * - Ghi nhật ký kèm thông tin lớp và giáo án
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Thông tin lớp, giáo án và ngày bắt đầu
   * @returns Promise trả về lớp vừa tạo
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws ConflictException Nếu mã lớp đã tồn tại
   * @throws BadRequestException Nếu giáo án không thuộc Head Trainer gọi, hoặc ngày bắt đầu ở quá khứ (kiểm sau cùng)
   */
  async create(
    actor: Actor,
    body: CreateTrainingClassDto,
  ): Promise<TrainingClassResponseDto> {
    const caller = await this.access.currentUser(actor);
    const code = body.code.trim().toUpperCase();
    const existing = await this.classes.findOneBy({ code });
    if (existing) {
      throw fieldConflict('code', `Mã lớp ${code} đã tồn tại`);
    }
    const headTrainerId = caller.id;
    const row = await this.dataSource.transaction(async (manager) => {
      const phases = await this.ownedPlanPhases(
        manager,
        body.planId,
        headTrainerId,
      );
      const startDate = body.startDate;
      assertClassStartNotPast(startDate, clubToday());
      const saved = await manager.save(
        manager.create(TrainingClassEntity, {
          code,
          name: body.name,
          description: body.description ?? null,
          raceAptitude: body.raceAptitude ?? null,
          maxHorses: body.maxHorses ?? 10,
          headTrainerId,
          planId: body.planId,
          startDate,
          endDate: classEndDate(startDate, totalPlanWeeks(phases)),
          status: TrainingClassStatus.ACTIVE,
        }),
      );
      await this.copyPlanPhases(manager, saved.id, phases);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TRAINING_CLASS,
        entityId: saved.id,
        before: null,
        after: {
          ...classAuditData(saved),
          planId: saved.planId,
          status: saved.status,
        },
        feature: AuditFeature.TRAIN_CLASS,
      });
      return saved;
    });
    return toTrainingClassResponse(row);
  }

  async list(actor: Actor): Promise<TrainingClassResponseDto[]> {
    const caller = await this.access.currentUser(actor);
    const rows = await this.classes.find({
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
    const visible = await Promise.all(
      rows.map(async (row) =>
        (await this.access.canReadClass(
          actor,
          caller.id,
          row,
          this.dataSource.manager,
        ))
          ? row
          : null,
      ),
    );
    return visible.filter((row): row is TrainingClassEntity => !!row).map(
      toTrainingClassResponse,
    );
  }

  async get(actor: Actor, classId: string): Promise<TrainingClassResponseDto> {
    return toTrainingClassResponse(
      await this.access.assertCanReadClass(actor, classId),
    );
  }

  /**
   * Xem bản chép giáo án của lớp kèm khoảng ngày và thời lượng tối thiểu của từng giai đoạn
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @returns Promise trả về các giai đoạn của lớp theo thứ tự
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có lớp hoặc lớp nằm ngoài phạm vi xem của người gọi
   */
  async getPlan(
    actor: Actor,
    classId: string,
  ): Promise<TrainingClassPlanResponseDto> {
    const row = await this.access.assertCanReadClass(actor, classId);
    const phases = await this.dataSource.manager.find(
      TrainingClassPhaseEntity,
      {
        where: { classId },
        relations: { subjects: { subject: true } },
      },
    );
    return toTrainingClassPlanResponse(row, phases);
  }

  /**
   * Xem tiến độ xếp lịch của lớp theo từng tuần, so với số buổi tối thiểu của giáo án lớp
   *
   * - Chỉ tính buổi chưa hủy; tuần của buổi theo ngày bắt đầu (lịch CLB)
   * - Thời lượng đã xếp = tổng (giờ kết thúc − giờ bắt đầu) của các buổi chưa hủy
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @returns Promise trả về thời lượng tối thiểu, thời lượng đã xếp và tiến độ từng tuần
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có lớp hoặc lớp nằm ngoài phạm vi xem của người gọi
   */
  async getProgress(
    actor: Actor,
    classId: string,
  ): Promise<TrainingClassProgressResponseDto> {
    const row = await this.access.assertCanReadClass(actor, classId);
    const manager = this.dataSource.manager;
    const phases = await manager.find(TrainingClassPhaseEntity, {
      where: { classId },
      relations: { subjects: { subject: true } },
    });
    const sessions = await manager.find(TrainingSessionEntity, {
      where: { classId, status: Not(TrainingSessionStatus.CANCELLED) },
    });
    return toTrainingClassProgressResponse(
      classId,
      phases.reduce((sum, phase) => sum + phaseMinMinutes(phase), 0),
      sessions.reduce(
        (sum, s) =>
          sum +
          (s.scheduledEndAt.getTime() - s.scheduledStartAt.getTime()) / 60_000,
        0,
      ),
      classWeeklyProgress(
        row.startDate,
        phases,
        sessions.map((s) => ({
          date: toClubDate(s.scheduledStartAt),
          subjectId: s.subjectId,
        })),
      ),
      new Map(
        phases.flatMap((phase) =>
          phase.subjects.map((item) => [item.subjectId, item.subject.name]),
        ),
      ),
    );
  }

  /**
   * Hoàn thành hoặc hủy lớp
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param classId UUID của lớp
   * @param body Trạng thái mới và lý do hủy
   * @returns Promise trả về lớp sau khi đổi trạng thái
   */
  async updateStatus(
    actor: Actor,
    classId: string,
    body: UpdateTrainingClassStatusDto,
  ): Promise<TrainingClassResponseDto> {
    return body.status === TrainingClassStatus.COMPLETED
      ? this.complete(actor, classId)
      : this.cancel(actor, classId, body.cancelReason!);
  }

  private async complete(
    actor: Actor,
    classId: string,
  ): Promise<TrainingClassResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const row = await this.access.lockedTrainingClass(manager, classId);
      this.access.assertCanManageClass(actor, caller.id, row.headTrainerId);
      return completeTrainingClass(
        manager,
        this.auditService,
        row,
        caller.id,
        null,
      );
    });
    return toTrainingClassResponse(saved);
  }

  private async cancel(
    actor: Actor,
    classId: string,
    reason: string,
  ): Promise<TrainingClassResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const row = await this.access.lockedTrainingClass(manager, classId);
      this.access.assertCanManageClass(actor, caller.id, row.headTrainerId);
      assertClassCancellable(row.status);
      const previousStatus = row.status;

      const ongoingParticipants = await manager
        .getRepository(SessionParticipantEntity)
        .createQueryBuilder('participant')
        .innerJoin(
          TrainingSessionEntity,
          'session',
          'session.id = participant.session_id',
        )
        .where('session.class_id = :classId', { classId })
        .andWhere('participant.status = :status', {
          status: SessionParticipantStatus.ONGOING,
        })
        .getCount();
      if (ongoingParticipants) {
        throw new ConflictException(
          'Không thể hủy lớp khi còn lượt tập đang tập',
        );
      }
      await this.lockClassRowsToCancel(manager, classId);

      const now = new Date();
      await manager.update(
        TrainingSessionEntity,
        {
          classId,
          status: In([
            TrainingSessionStatus.SCHEDULED,
            TrainingSessionStatus.IN_PROGRESS,
          ]),
        },
        {
          status: TrainingSessionStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: caller.id,
          cancelReason: `Lớp bị hủy: ${reason}`,
        },
      );

      await manager
        .createQueryBuilder()
        .update(SessionParticipantEntity)
        .set({
          status: SessionParticipantStatus.CANCELLED,
          cancelReason: reason,
        })
        .where(
          'session_id IN (SELECT id FROM training_sessions WHERE class_id = :classId)',
          { classId },
        )
        .andWhere('status IN (:...statuses)', {
          statuses: [
            SessionParticipantStatus.PLANNED,
            SessionParticipantStatus.PRESENT,
            SessionParticipantStatus.READY,
          ],
        })
        .execute();

      await manager.update(
        HorseEnrollmentEntity,
        { classId, status: HorseEnrollmentStatus.ACTIVE },
        { status: HorseEnrollmentStatus.CANCELLED, leftAt: now },
      );

      row.status = TrainingClassStatus.CANCELLED;
      row.cancelledAt = now;
      row.cancelReason = reason;
      const saved = await manager.save(row);
      await this.recordStatusChange(manager, caller.id, saved, previousStatus);
      return saved;
    });
    return toTrainingClassResponse(saved);
  }

  /**
   * Khóa các row mà hủy lớp sẽ đổi, theo thứ tự buổi → ghi danh → lượt, mỗi loại theo thứ tự UUID
   *
   * - Buổi SCHEDULED, IN_PROGRESS của lớp; ghi danh ACTIVE của lớp; lượt PLANNED, PRESENT, READY ở các buổi của lớp
   * - Không kiểm gì, không ném lỗi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param classId UUID của lớp đã khóa
   * @returns Promise hoàn tất khi đã khóa xong
   */
  private async lockClassRowsToCancel(
    manager: EntityManager,
    classId: string,
  ): Promise<void> {
    const sessions = await manager.find(TrainingSessionEntity, {
      select: { id: true },
      where: {
        classId,
        status: In([
          TrainingSessionStatus.SCHEDULED,
          TrainingSessionStatus.IN_PROGRESS,
        ]),
      },
    });
    await this.access.lockSessions(
      manager,
      sessions.map((session) => session.id),
    );
    await manager.find(HorseEnrollmentEntity, {
      select: { id: true },
      where: { classId, status: HorseEnrollmentStatus.ACTIVE },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const participants = await manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .select('participant.id', 'id')
      .innerJoin(
        TrainingSessionEntity,
        'session',
        'session.id = participant.session_id',
      )
      .where('session.class_id = :classId', { classId })
      .andWhere('participant.status IN (:...statuses)', {
        statuses: [
          SessionParticipantStatus.PLANNED,
          SessionParticipantStatus.PRESENT,
          SessionParticipantStatus.READY,
        ],
      })
      .getRawMany<{ id: string }>();
    await this.access.lockParticipants(
      manager,
      participants.map((participant) => participant.id),
    );
  }

  async update(
    actor: Actor,
    classId: string,
    body: UpdateTrainingClassDto,
  ): Promise<TrainingClassResponseDto> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const row = await this.access.lockedTrainingClass(manager, classId);
      this.access.assertCanManageClass(actor, caller.id, row.headTrainerId);
      assertClassEditable(row.status);
      const before = classAuditData(row);
      if (body.code && body.code.trim().toUpperCase() !== row.code) {
        const nextCode = body.code.trim().toUpperCase();
        const dup = await manager.findOneBy(TrainingClassEntity, {
          code: nextCode,
        });
        if (dup) {
          throw fieldConflict('code', `Mã lớp ${nextCode} đã tồn tại`);
        }
        row.code = nextCode;
      }
      const startDate = body.startDate ?? row.startDate;
      const endDate = body.startDate
        ? classEndDate(
            startDate,
            totalPlanWeeks(
              await manager.findBy(TrainingClassPhaseEntity, { classId }),
            ),
          )
        : row.endDate;
      const activeEnrollments = await manager.countBy(HorseEnrollmentEntity, {
        classId,
        status: HorseEnrollmentStatus.ACTIVE,
      });
      const nextMaxHorses = body.maxHorses ?? row.maxHorses;
      if (activeEnrollments > nextMaxHorses) {
        throw new ConflictException(
          `Sức chứa mới không được nhỏ hơn số ngựa đang ghi danh (${activeEnrollments})`,
        );
      }
      const rangeStart = clubDateTimeToInstant(startDate, '00:00');
      const rangeEnd = clubDateTimeToInstant(shiftDays(endDate, 1), '00:00');
      const outsideSessions = await manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.class_id = :classId', { classId })
        .andWhere(
          '(session.scheduled_start_at < :rangeStart OR session.scheduled_end_at >= :rangeEnd)',
          { rangeStart, rangeEnd },
        )
        .getCount();
      if (outsideSessions) {
        throw new ConflictException(
          'Khoảng ngày mới không bao phủ các buổi tập hiện có',
        );
      }
      const outsideEnrollments = await manager
        .getRepository(HorseEnrollmentEntity)
        .createQueryBuilder('enrollment')
        .where('enrollment.class_id = :classId', { classId })
        .andWhere(
          '(enrollment.enrolled_at < :rangeStart OR enrollment.enrolled_at >= :rangeEnd OR (enrollment.left_at IS NOT NULL AND enrollment.left_at >= :rangeEnd))',
          { rangeStart, rangeEnd },
        )
        .getCount();
      if (outsideEnrollments) {
        throw new ConflictException(
          'Khoảng ngày mới không bao phủ các ghi danh hiện có',
        );
      }
      if (startDate !== row.startDate) {
        assertClassStartNotPast(startDate, clubToday());
      }
      Object.assign(row, {
        name: body.name ?? row.name,
        description:
          body.description !== undefined ? body.description : row.description,
        raceAptitude:
          body.raceAptitude !== undefined
            ? body.raceAptitude
            : row.raceAptitude,
        maxHorses: body.maxHorses ?? row.maxHorses,
        startDate,
        endDate,
      });
      const saved = await manager.save(row);
      const diff = changedFieldsDiff(before, classAuditData(saved));
      if (diff) {
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.TRAINING_CLASS,
          entityId: classId,
          ...diff,
          feature: AuditFeature.TRAIN_CLASS,
        });
      }
      return saved;
    });
    return toTrainingClassResponse(updated);
  }

  /**
   * Ghi nhật ký một lần đổi trạng thái lớp
   *
   * - Lớp đã hủy: lý do hủy ghi vào cột lý do
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID người đổi trạng thái
   * @param row Lớp sau khi đổi trạng thái
   * @param previousStatus Trạng thái trước khi đổi
   * @returns Promise hoàn tất khi đã ghi
   */
  private async recordStatusChange(
    manager: EntityManager,
    callerId: string,
    row: TrainingClassEntity,
    previousStatus: TrainingClassStatus,
  ): Promise<void> {
    await this.auditService.record(manager, {
      actorId: callerId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.TRAINING_CLASS,
      entityId: row.id,
      before: { status: previousStatus },
      after: { status: row.status },
      reason: row.cancelReason,
      feature: AuditFeature.TRAIN_CLASS,
    });
  }

  /**
   * Chép các giai đoạn và môn của giáo án vào lớp, giữ thứ tự và số buổi tối thiểu mỗi tuần
   *
   * @param manager EntityManager của transaction đang chạy
   * @param classId UUID của lớp
   * @param phases Các giai đoạn của giáo án theo thứ tự, kèm các môn
   * @returns Promise hoàn tất khi đã lưu
   */
  private async copyPlanPhases(
    manager: EntityManager,
    classId: string,
    phases: TrainingPlanPhaseEntity[],
  ): Promise<void> {
    const saved = await manager.save(
      phases.map((phase) =>
        manager.create(TrainingClassPhaseEntity, {
          classId,
          position: phase.position,
          weeks: phase.weeks,
        }),
      ),
    );
    await manager.save(
      phases.flatMap((phase, index) =>
        phase.subjects.map((item) =>
          manager.create(TrainingClassPhaseSubjectEntity, {
            phaseId: saved[index].id,
            subjectId: item.subjectId,
            minSessionsPerWeek: item.minSessionsPerWeek,
          }),
        ),
      ),
    );
  }

  /**
   * Lấy các giai đoạn của giáo án dùng cho lớp theo thứ tự, kèm kiểm giáo án thuộc Head Trainer phụ trách lớp
   *
   * @param manager EntityManager dùng để query
   * @param planId UUID của giáo án
   * @param headTrainerId UUID của Head Trainer phụ trách lớp
   * @returns Promise trả về các giai đoạn của giáo án kèm số tuần và các môn, theo thứ tự
   * @throws BadRequestException Nếu không có giáo án hoặc giáo án không thuộc Head Trainer phụ trách lớp
   */
  private async ownedPlanPhases(
    manager: EntityManager,
    planId: string,
    headTrainerId: string | null,
  ): Promise<TrainingPlanPhaseEntity[]> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id: planId },
      relations: { phases: { subjects: true } },
    });
    if (!plan || plan.headTrainerId !== headTrainerId) {
      throw new BadRequestException(
        'Giáo án không thuộc Huấn luyện viên trưởng phụ trách lớp',
      );
    }
    return [...plan.phases].sort((a, b) => a.position - b.position);
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../../common/constants/club.constants';
import type { Actor } from '../../../../common/types/actor';
import {
  ClassSchedulePreviewDto,
  ClassScheduleInputDto,
} from '../../dto/class-schedule.dto';
import {
  CreateTrainingClassDto,
  TrainingClassResponseDto,
  UpdateTrainingClassStatusDto,
  UpdateTrainingClassDto,
} from '../../dto/training-class.dto';
import { HorseEnrollmentStatus } from '../../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../../enums/training-session-status.enum';
import { TrainingSessionType } from '../../enums/training-session-type.enum';
import { HorseEnrollmentEntity } from '../../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { TrainingClassEntity } from '../../entities/training-class.entity';
import { TimeTrialEntity } from '../../entities/time-trial.entity';
import { TrainingPlanPhaseEntity } from '../../entities/training-plan-phase.entity';
import { TrainingPlanEntity } from '../../entities/training-plan.entity';
import { TrainingSessionEntity } from '../../entities/training-session.entity';
import { TrainingSubjectEntity } from '../../entities/training-subject.entity';
import { toTrainingClassResponse } from '../../mappers/training-class.mapper';
import {
  assertClassActivatable,
  assertClassCancellable,
  assertClassCompletable,
  assertClassEditable,
  assertNoOverlappingClassSession,
  assertSessionWindowInClass,
  assertSubjectExercise,
  classEndDate,
  dateOnly,
  totalPlanWeeks,
} from '../../policies/training.policy';
import { TrainingAccessService } from '../../shared/training-access.service';
import { buildClassSchedule } from '../../utils/class-schedule';

/**
 * Số dòng tối đa trong một câu INSERT khi lưu nhiều buổi tập hoặc cấu hình chạy thử một lượt
 */
const SAVE_CHUNK_SIZE = 100;

@Injectable()
export class TrainingClassesService {
  constructor(
    @InjectRepository(TrainingClassEntity)
    private readonly classes: Repository<TrainingClassEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Xem trước lịch buổi tập sinh từ giáo án của Head Trainer gọi, không lưu gì
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Giáo án, ngày bắt đầu, giờ bắt đầu và thời lượng
   * @returns Promise trả về ngày bắt đầu, ngày kết thúc và các buổi tập theo thứ tự thời gian
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws BadRequestException Nếu không có giáo án hoặc giáo án không thuộc người gọi
   */
  async previewSchedule(
    actor: Actor,
    body: ClassScheduleInputDto,
  ): Promise<ClassSchedulePreviewDto> {
    const caller = await this.access.currentUser(actor);
    const phases = await this.ownedPlanPhases(
      this.dataSource.manager,
      body.planId,
      caller.id,
    );
    const startDate = dateOnly(body.startDate);
    return {
      startDate,
      endDate: classEndDate(startDate, totalPlanWeeks(phases)),
      sessions: buildClassSchedule(
        phases,
        startDate,
        body.startTime,
        body.durationMinutes,
      ).map((session) => ({
        week: session.week,
        subjectId: session.subject.id,
        name: session.subject.name,
        sessionType: session.subject.sessionType,
        intensity: session.subject.intensity,
        plannedDistanceM: session.subject.plannedDistanceM,
        surface: session.subject.surface,
        targetTimeMs: session.subject.targetTimeMs,
        scheduledStartAt: session.scheduledStartAt,
        scheduledEndAt: session.scheduledEndAt,
      })),
    };
  }

  /**
   * Head Trainer tạo lớp nháp do mình phụ trách theo giáo án của mình, kèm các buổi tập đã chỉnh từ xem trước, trong một transaction
   *
   * - Ngày kết thúc = ngày bắt đầu + tổng số tuần của giáo án
   * - Loại buổi lấy theo môn của từng buổi; buổi chạy thử được tạo sẵn cấu hình chạy thử (cự ly, thời gian mục tiêu)
   * - Buổi tập lưu ở trạng thái DRAFT
   * - Kiểm hết mọi buổi trước khi lưu; một buổi sai thì không lưu gì
   * - Buổi tập và cấu hình chạy thử lưu theo lô, mỗi câu INSERT tối đa 100 dòng
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Thông tin lớp, giáo án, ngày bắt đầu và các buổi tập
   * @returns Promise trả về lớp vừa tạo
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws ConflictException Nếu mã lớp đã tồn tại, hoặc hai buổi trong danh sách trùng giờ
   * @throws BadRequestException Nếu giáo án không thuộc Head Trainer gọi, môn học không tồn tại, buổi nằm ngoài thời gian của lớp hoặc nội dung buổi sai theo loại môn
   */
  async create(
    actor: Actor,
    body: CreateTrainingClassDto,
  ): Promise<TrainingClassResponseDto> {
    const caller = await this.access.currentUser(actor);
    const code = body.code.trim().toUpperCase();
    const existing = await this.classes.findOneBy({ code });
    if (existing) {
      throw new ConflictException(`Mã lớp ${code} đã tồn tại`);
    }
    const headTrainerId = caller.id;
    const row = await this.dataSource.transaction(async (manager) => {
      const phases = await this.ownedPlanPhases(
        manager,
        body.planId,
        headTrainerId,
      );
      const startDate = dateOnly(body.startDate);
      const endDate = classEndDate(startDate, totalPlanWeeks(phases));
      const subjectIds = [...new Set(body.sessions.map((s) => s.subjectId))];
      const subjects = await manager.findBy(TrainingSubjectEntity, {
        id: In(subjectIds),
      });
      if (subjects.length !== subjectIds.length) {
        throw new BadRequestException('Có môn học không tồn tại');
      }
      const typeOf = new Map(subjects.map((s) => [s.id, s.sessionType]));
      for (const session of body.sessions) {
        assertSubjectExercise(
          typeOf.get(session.subjectId)!,
          session.plannedDistanceM,
          session.targetTimeMs ?? null,
        );
        assertSessionWindowInClass(
          session.scheduledStartAt,
          session.scheduledEndAt,
          startDate,
          endDate,
        );
      }
      const windows = body.sessions
        .map((session) => ({
          scheduledStartAt: new Date(session.scheduledStartAt),
          scheduledEndAt: new Date(session.scheduledEndAt),
        }))
        .sort(
          (a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime(),
        );
      windows.forEach((window, index) =>
        assertNoOverlappingClassSession(window, windows.slice(0, index)),
      );
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
          endDate,
          status: TrainingClassStatus.DRAFT,
        }),
      );
      const sessions = await manager.save(
        body.sessions.map((input) =>
          manager.create(TrainingSessionEntity, {
            classId: saved.id,
            subjectId: input.subjectId,
            name: input.name,
            sessionType: typeOf.get(input.subjectId)!,
            intensity: input.intensity,
            plannedDistanceM: input.plannedDistanceM,
            scheduledStartAt: new Date(input.scheduledStartAt),
            scheduledEndAt: new Date(input.scheduledEndAt),
            location: input.location ?? null,
            surface: input.surface ?? null,
            notes: input.notes ?? null,
            status: TrainingSessionStatus.DRAFT,
          }),
        ),
        { chunk: SAVE_CHUNK_SIZE },
      );
      await manager.save(
        sessions.flatMap((session, index) => {
          const input = body.sessions[index];
          return session.sessionType === TrainingSessionType.TIME_TRIAL
            ? [
                manager.create(TimeTrialEntity, {
                  sessionId: session.id,
                  distanceM: String(input.plannedDistanceM),
                  targetTimeMs:
                    input.targetTimeMs == null
                      ? null
                      : String(input.targetTimeMs),
                  notes: null,
                }),
              ]
            : [];
        }),
        { chunk: SAVE_CHUNK_SIZE },
      );
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

  async updateStatus(
    actor: Actor,
    classId: string,
    body: UpdateTrainingClassStatusDto,
  ): Promise<TrainingClassResponseDto> {
    switch (body.status) {
      case TrainingClassStatus.ACTIVE:
        return this.activate(actor, classId);
      case TrainingClassStatus.COMPLETED:
        return this.complete(actor, classId);
      case TrainingClassStatus.CANCELLED:
        return this.cancel(actor, classId, body.cancelReason!);
      case TrainingClassStatus.DRAFT:
        throw new ConflictException('Không thể chuyển lớp về trạng thái nháp');
    }
  }

  private async activate(
    actor: Actor,
    classId: string,
  ): Promise<TrainingClassResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const row = await this.access.lockedTrainingClass(manager, classId);
      this.access.assertCanManageClass(actor, caller.id, row.headTrainerId);
      assertClassActivatable(row.status);
      if (!row.headTrainerId) {
        throw new ConflictException(
          'Phải phân công Huấn luyện viên trưởng trước khi kích hoạt lớp',
        );
      }
      row.status = TrainingClassStatus.ACTIVE;
      return manager.save(row);
    });
    return toTrainingClassResponse(saved);
  }

  private async complete(
    actor: Actor,
    classId: string,
  ): Promise<TrainingClassResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const row = await this.access.lockedTrainingClass(manager, classId);
      this.access.assertCanManageClass(actor, caller.id, row.headTrainerId);
      assertClassCompletable(row.status);

      const unfinishedSessions = await manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.class_id = :classId', { classId })
        .andWhere('session.status IN (:...statuses)', {
          statuses: [
            TrainingSessionStatus.DRAFT,
            TrainingSessionStatus.SCHEDULED,
            TrainingSessionStatus.IN_PROGRESS,
          ],
        })
        .getCount();
      if (unfinishedSessions) {
        throw new ConflictException('Lớp vẫn còn buổi tập chưa kết thúc');
      }

      const now = new Date();
      await manager.update(
        HorseEnrollmentEntity,
        { classId, status: HorseEnrollmentStatus.ACTIVE },
        { status: HorseEnrollmentStatus.LEFT, leftAt: now },
      );
      row.status = TrainingClassStatus.COMPLETED;
      row.completedAt = now;
      return manager.save(row);
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

      const now = new Date();
      await manager.update(
        TrainingSessionEntity,
        {
          classId,
          status: In([
            TrainingSessionStatus.DRAFT,
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
      return manager.save(row);
    });
    return toTrainingClassResponse(saved);
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
      if (body.code && body.code.trim().toUpperCase() !== row.code) {
        const nextCode = body.code.trim().toUpperCase();
        const dup = await manager.findOneBy(TrainingClassEntity, {
          code: nextCode,
        });
        if (dup) {
          throw new ConflictException(`Mã lớp ${nextCode} đã tồn tại`);
        }
        row.code = nextCode;
      }
      const startDate = body.startDate
        ? dateOnly(body.startDate)
        : row.startDate;
      const endDate = body.startDate
        ? classEndDate(
            startDate,
            totalPlanWeeks(
              await this.ownedPlanPhases(
                manager,
                row.planId,
                row.headTrainerId,
              ),
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
      const outsideSessions = await manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.class_id = :classId', { classId })
        .andWhere(
          '((session.scheduled_start_at AT TIME ZONE :timeZone)::date < :startDate OR (session.scheduled_end_at AT TIME ZONE :timeZone)::date > :endDate)',
          { startDate, endDate, timeZone: CLUB_TIME_ZONE },
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
          "(enrollment.enrolled_at::date < :startDate OR enrollment.enrolled_at::date > :endDate OR (enrollment.left_at IS NOT NULL AND enrollment.left_at::date > :endDate))",
          { startDate, endDate },
        )
        .getCount();
      if (outsideEnrollments) {
        throw new ConflictException(
          'Khoảng ngày mới không bao phủ các ghi danh hiện có',
        );
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
      return manager.save(row);
    });
    return toTrainingClassResponse(updated);
  }

  /**
   * Lấy các giai đoạn của giáo án dùng cho lớp theo thứ tự, kèm kiểm giáo án thuộc Head Trainer phụ trách lớp
   *
   * @param manager EntityManager dùng để query
   * @param planId UUID của giáo án
   * @param headTrainerId UUID của Head Trainer phụ trách lớp
   * @returns Promise trả về các giai đoạn của giáo án kèm số tuần và các môn theo thứ trong tuần, theo thứ tự
   * @throws BadRequestException Nếu không có giáo án hoặc giáo án không thuộc Head Trainer phụ trách lớp
   */
  private async ownedPlanPhases(
    manager: EntityManager,
    planId: string,
    headTrainerId: string | null,
  ): Promise<TrainingPlanPhaseEntity[]> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id: planId },
      relations: { phases: { subjects: { subject: true } } },
    });
    if (!plan || plan.headTrainerId !== headTrainerId) {
      throw new BadRequestException(
        'Giáo án không thuộc Huấn luyện viên trưởng phụ trách lớp',
      );
    }
    return [...plan.phases].sort((a, b) => a.position - b.position);
  }
}

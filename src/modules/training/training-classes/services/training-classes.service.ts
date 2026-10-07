import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { Actor } from '../../../../common/types/actor';
import { UserRole } from '../../../users/user.enums';
import {
  CreateTrainingClassDto,
  TrainingClassResponseDto,
  UpdateTrainingClassStatusDto,
  UpdateTrainingClassDto,
} from '../../dto/training-class.dto';
import { HorseEnrollmentStatus } from '../../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
import { TrainingPlanStatus } from '../../enums/training-plan-status.enum';
import { TrainingSessionStatus } from '../../enums/training-session-status.enum';
import { HorseEnrollmentEntity } from '../../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { TrainingClassEntity } from '../../entities/training-class.entity';
import { TrainingPlanEntity } from '../../entities/training-plan.entity';
import { TrainingSessionEntity } from '../../entities/training-session.entity';
import { toTrainingClassResponse } from '../../mappers/training-class.mapper';
import {
  assertClassActivatable,
  assertClassCancellable,
  assertClassCompletable,
  assertClassEditable,
  assertValidDateRange,
  dateOnly,
} from '../../policies/training.policy';
import { TrainingAccessService } from '../../shared/training-access.service';

@Injectable()
export class TrainingClassesService {
  constructor(
    @InjectRepository(TrainingClassEntity)
    private readonly classes: Repository<TrainingClassEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    actor: Actor,
    body: CreateTrainingClassDto,
  ): Promise<TrainingClassResponseDto> {
    const caller = await this.access.currentUser(actor);
    const code = body.code.trim().toUpperCase();
    // validate class code exists ?
    const existing = await this.classes.findOneBy({ code });
    if (existing) {
      throw new ConflictException(`Mã lớp ${code} đã tồn tại`);
    }
    // validate startDate < endDate
    assertValidDateRange(body.startDate, body.endDate);
    if (body.headTrainerId) {
      await this.access.assertHeadTrainer(
        this.dataSource.manager,
        body.headTrainerId,
      );
    }
    const headTrainerId = body.headTrainerId ??
      (caller.role === UserRole.HEAD_TRAINER ? caller.id : null);
    if (
      caller.role === UserRole.HEAD_TRAINER &&
      headTrainerId !== caller.id
    ) {
      throw new ForbiddenException(
        'Head trainer chỉ được tạo class cho chính mình',
      );
    }
    const row = await this.classes.save(
      this.classes.create({
        code,
        name: body.name,
        description: body.description ?? null,
        raceAptitude: body.raceAptitude ?? null,
        maxHorses: body.maxHorses ?? 10,
        headTrainerId,
        startDate: dateOnly(body.startDate),
        endDate: dateOnly(body.endDate),
        status: TrainingClassStatus.DRAFT,
      }),
    );
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
        throw new ConflictException(
          'Không thể chuyển class về trạng thái DRAFT',
        );
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
          'Phải phân công head trainer trước khi kích hoạt class',
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

      const unfinishedPlans = await manager.countBy(TrainingPlanEntity, {
        classId,
        status: In([TrainingPlanStatus.SCHEDULED, TrainingPlanStatus.ACTIVE]),
      });
      if (unfinishedPlans) {
        throw new ConflictException('Class vẫn còn plan chưa kết thúc');
      }

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
        throw new ConflictException('Class vẫn còn session chưa kết thúc');
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
          'Không thể hủy class khi còn participant ONGOING',
        );
      }

      const now = new Date();
      const planIds = (
        await manager.findBy(TrainingPlanEntity, { classId })
      ).map((plan) => plan.id);

      if (planIds.length) {
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
            cancelReason: `Class bị hủy: ${reason}`,
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
          TrainingPlanEntity,
          {
            classId,
            status: In([
              TrainingPlanStatus.SCHEDULED,
              TrainingPlanStatus.ACTIVE,
            ]),
          },
          {
            status: TrainingPlanStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: reason,
          },
        );
      }

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
      const endDate = body.endDate ? dateOnly(body.endDate) : row.endDate;
      assertValidDateRange(startDate, endDate);
      if (body.headTrainerId)
        await this.access.assertHeadTrainer(manager, body.headTrainerId);
      if (
        caller.role === UserRole.HEAD_TRAINER &&
        body.headTrainerId !== undefined &&
        body.headTrainerId !== caller.id
      ) {
        throw new ForbiddenException(
          'Head trainer không được chuyển class cho head trainer khác',
        );
      }
      const activeEnrollments = await manager.countBy(HorseEnrollmentEntity, {
        classId,
        status: HorseEnrollmentStatus.ACTIVE,
      });
      const nextMaxHorses = body.maxHorses ?? row.maxHorses;
      if (activeEnrollments > nextMaxHorses) {
        throw new ConflictException(
          `Sức chứa mới không được nhỏ hơn số horse đang enroll (${activeEnrollments})`,
        );
      }
      const outsidePlans = await manager
        .getRepository(TrainingPlanEntity)
        .createQueryBuilder('plan')
        .where('plan.class_id = :classId', { classId })
        .andWhere(
          '(plan.start_date < :startDate OR plan.end_date > :endDate)',
          { startDate, endDate },
        )
        .getCount();
      if (outsidePlans) {
        throw new ConflictException(
          'Khoảng ngày mới không bao phủ các plan hiện có',
        );
      }
      const outsideSessions = await manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.class_id = :classId', { classId })
        .andWhere(
          '(session.scheduled_start_at::date < :startDate OR session.scheduled_end_at::date > :endDate)',
          { startDate, endDate },
        )
        .getCount();
      if (outsideSessions) {
        throw new ConflictException(
          'Khoảng ngày mới không bao phủ các session hiện có',
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
          'Khoảng ngày mới không bao phủ các enrollment hiện có',
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
        headTrainerId: body.headTrainerId ?? row.headTrainerId,
        startDate,
        endDate,
      });
      return manager.save(row);
    });
    return toTrainingClassResponse(updated);
  }
}

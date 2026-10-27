import { Injectable } from '@nestjs/common';
import {
  And,
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThan,
  MoreThanOrEqual,
} from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import {
  clubDateTimeToInstant,
  clubToday,
  shiftDays,
} from '../../../common/utils/club-date';
import {
  CareScheduleStatus,
  VET_APPOINTMENT_TYPES,
} from '../../medical/constants/care-schedule.enum';
import { CareScheduleEntity } from '../../medical/entities/care-schedule.entity';
import { SessionParticipantEntity } from '../../training/entities/session-participant.entity';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../../training/enums/training-session-status.enum';
import { currentUserForActor } from '../../users/utils/current-user';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import { GroomTodayResponseDto } from '../dto/groom-today.dto';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { FeedingPlanEntity } from '../entities/feeding-plan.entity';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { StallAssignmentEntity } from '../entities/stall-assignment.entity';
import { toDailyChecklistResponse } from '../mappers/daily-checklist.mapper';
import { toFeedingPlanResponse } from '../mappers/feeding-plan.mapper';
import { toGroomTodayResponse } from '../mappers/groom-today.mapper';

const CHECKLIST_RELATIONS = {
  horse: true,
  groom: true,
  items: { taskType: true, doer: true },
} as const;

const PLAN_RELATIONS = {
  horse: true,
  creator: true,
  approver: true,
  items: { supplyItem: true },
} as const;

const HIDDEN_SESSION_STATUSES = [TrainingSessionStatus.CANCELLED];

const VISIBLE_RUN_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
  SessionParticipantStatus.ONGOING,
  SessionParticipantStatus.COMPLETED,
  SessionParticipantStatus.STOPPED,
];

/**
 * Màn Hôm nay của Groom: gom việc trong ngày của từng ngựa Groom đang phụ trách
 */
@Injectable()
export class GroomTodayService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Gom việc hôm nay của từng ngựa Groom đang phụ trách, ngựa theo tên
   *
   * - Khu, ô chuồng hiện tại
   * - Checklist hôm nay (nếu đã sinh)
   * - Khẩu phần đang áp dụng
   * - Lượt tập hôm nay Groom được giao dắt, bỏ buổi đã hủy
   * - Lượt tập Groom được giao dắt ở ngựa Groom không phụ trách: tách ra assistedRuns
   * - Lịch hẹn khám định kỳ và tái khám hôm nay của ngựa Groom phụ trách: horseVetAppointments, chỉ để xem
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về ngày hôm nay và việc của từng ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async today(actor: Actor): Promise<GroomTodayResponseDto> {
    const manager = this.dataSource.manager;
    const caller = await currentUserForActor(manager, actor);
    const date = clubToday();
    const dayStart = clubDateTimeToInstant(date, '00:00');
    const dayEnd = clubDateTimeToInstant(shiftDays(date, 1), '00:00');
    const assignments = await manager.find(GroomAssignmentEntity, {
      where: { groomId: caller.id, endAt: IsNull() },
      relations: { horse: { barn: true } },
    });
    const horses = assignments
      .flatMap((assignment) => (assignment.horse ? [assignment.horse] : []))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    const horseIds = horses.map((horse) => horse.id);
    const ownHorseIds = new Set(horseIds);
    const runs = await this.runsOf(manager, caller.id, dayStart, dayEnd);
    const assistedRuns = runs.filter((run) => !ownHorseIds.has(run.horseId));
    if (horseIds.length === 0) {
      return toGroomTodayResponse(date, [], assistedRuns, []);
    }
    const [stalls, checklists, plans, vetAppointments] = await Promise.all([
      manager.find(StallAssignmentEntity, {
        where: { horseId: In(horseIds), endAt: IsNull() },
        relations: { stall: true },
        withDeleted: true,
      }),
      manager.find(DailyChecklistEntity, {
        where: { horseId: In(horseIds), checklistDate: date },
        relations: CHECKLIST_RELATIONS,
        withDeleted: true,
      }),
      manager.find(FeedingPlanEntity, {
        where: { horseId: In(horseIds), status: FeedingPlanStatus.ACTIVE },
        relations: PLAN_RELATIONS,
        withDeleted: true,
      }),
      manager.find(CareScheduleEntity, {
        where: {
          horseId: In(horseIds),
          type: In([...VET_APPOINTMENT_TYPES]),
          status: CareScheduleStatus.SCHEDULED,
          dueAt: And(MoreThanOrEqual(dayStart), LessThan(dayEnd)),
        },
        relations: { horse: true },
        withDeleted: true,
        order: { dueAt: 'ASC' },
      }),
    ]);
    const stallByHorse = new Map(
      stalls.map((row) => [row.horseId, row.stall.code]),
    );
    const checklistByHorse = new Map(
      checklists.map((row) => [row.horseId, toDailyChecklistResponse(row)]),
    );
    const planByHorse = new Map(
      plans.map((row) => [row.horseId, toFeedingPlanResponse(row)]),
    );
    return toGroomTodayResponse(
      date,
      horses.map((horse) => ({
        horse,
        stallCode: stallByHorse.get(horse.id) ?? null,
        checklist: checklistByHorse.get(horse.id) ?? null,
        feedingPlan: planByHorse.get(horse.id) ?? null,
        runs: runs.filter((run) => run.horseId === horse.id),
      })),
      assistedRuns,
      vetAppointments,
    );
  }

  /**
   * Lấy các lượt tập Groom được giao dắt ở mọi ngựa có buổi bắt đầu trong ngày, bỏ buổi đã hủy và lượt đã hủy, hủy do khóa, vắng, bỏ qua, không đủ điều kiện
   *
   * - Kèm ngựa, kể cả hồ sơ đã xóa mềm
   *
   * @param manager EntityManager dùng để query
   * @param groomId UUID của Groom
   * @param dayStart Đầu ngày theo giờ CLB
   * @param dayEnd Đầu ngày hôm sau theo giờ CLB
   * @returns Promise trả về các lượt tập kèm buổi và ngựa, theo giờ bắt đầu
   */
  private runsOf(
    manager: EntityManager,
    groomId: string,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<SessionParticipantEntity[]> {
    return manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .innerJoinAndSelect('participant.session', 'session')
      .innerJoinAndSelect('participant.horse', 'horse')
      .withDeleted()
      .where('participant.assignedGroomId = :groomId', { groomId })
      .andWhere('session.scheduledStartAt >= :dayStart', { dayStart })
      .andWhere('session.scheduledStartAt < :dayEnd', { dayEnd })
      .andWhere('session.status NOT IN (:...hidden)', {
        hidden: HIDDEN_SESSION_STATUSES,
      })
      .andWhere('participant.status IN (:...visible)', {
        visible: VISIBLE_RUN_STATUSES,
      })
      .orderBy('session.scheduledStartAt', 'ASC')
      .getMany();
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, LessThan } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import {
  clubDateTimeToInstant,
  clubToday,
  shiftDays,
} from '../../../common/utils/club-date';
import { CareScheduleStatus } from '../../medical/constants/care-schedule.enum';
import { CareScheduleEntity } from '../../medical/entities/care-schedule.entity';
import { SessionParticipantEntity } from '../../training/entities/session-participant.entity';
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
import { DailyChecklistsService } from '../shared/daily-checklists.service';

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

const HIDDEN_SESSION_STATUSES = [
  TrainingSessionStatus.DRAFT,
  TrainingSessionStatus.CANCELLED,
];

/**
 * Màn Hôm nay của Groom: gom việc trong ngày của từng ngựa Groom đang phụ trách
 */
@Injectable()
export class GroomTodayService {
  constructor(
    private readonly dailyChecklists: DailyChecklistsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Gom việc hôm nay của từng ngựa Groom đang phụ trách, ngựa theo tên
   *
   * - Khu, ô chuồng hiện tại
   * - Checklist hôm nay, sinh nếu chưa có
   * - Khẩu phần đang áp dụng
   * - Lượt tập hôm nay Groom được giao dắt, bỏ buổi nháp và buổi đã hủy
   * - Lịch chăm sóc giao cho Groom, đến hạn tới hết hôm nay mà chưa làm
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
    if (horseIds.length === 0) return toGroomTodayResponse(date, dayStart, []);
    await this.dataSource.transaction(async (tx) => {
      for (const horseId of horseIds) {
        await this.dailyChecklists.ensureChecklist(tx, horseId, date);
      }
    });
    const [stalls, checklists, plans, runs, schedules] = await Promise.all([
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
      this.runsOf(manager, caller.id, horseIds, dayStart, dayEnd),
      manager.find(CareScheduleEntity, {
        where: {
          horseId: In(horseIds),
          assignedTo: caller.id,
          status: CareScheduleStatus.SCHEDULED,
          dueAt: LessThan(dayEnd),
        },
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
      dayStart,
      horses.map((horse) => ({
        horse,
        stallCode: stallByHorse.get(horse.id) ?? null,
        checklist: checklistByHorse.get(horse.id) ?? null,
        feedingPlan: planByHorse.get(horse.id) ?? null,
        runs: runs.filter((run) => run.horseId === horse.id),
        schedules: schedules.filter(
          (schedule) => schedule.horseId === horse.id,
        ),
      })),
    );
  }

  /**
   * Lấy các lượt tập Groom được giao dắt có buổi bắt đầu trong ngày, bỏ buổi nháp và buổi đã hủy
   *
   * @param manager EntityManager dùng để query
   * @param groomId UUID của Groom
   * @param horseIds UUID các ngựa Groom đang phụ trách
   * @param dayStart Đầu ngày theo giờ CLB
   * @param dayEnd Đầu ngày hôm sau theo giờ CLB
   * @returns Promise trả về các lượt tập kèm buổi, theo giờ bắt đầu
   */
  private runsOf(
    manager: EntityManager,
    groomId: string,
    horseIds: string[],
    dayStart: Date,
    dayEnd: Date,
  ): Promise<SessionParticipantEntity[]> {
    return manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .innerJoinAndSelect('participant.session', 'session')
      .where('participant.assignedGroomId = :groomId', { groomId })
      .andWhere('participant.horseId IN (:...horseIds)', { horseIds })
      .andWhere('session.scheduledStartAt >= :dayStart', { dayStart })
      .andWhere('session.scheduledStartAt < :dayEnd', { dayEnd })
      .andWhere('session.status NOT IN (:...hidden)', {
        hidden: HIDDEN_SESSION_STATUSES,
      })
      .orderBy('session.scheduledStartAt', 'ASC')
      .getMany();
  }
}

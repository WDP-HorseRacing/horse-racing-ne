import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { clubToday } from '../../../common/utils/club-date';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  DailyChecklistStatus,
  OPEN_CHECKLIST_STATUSES,
} from '../constants/daily-checklist-status.enum';
import {
  DailyChecklistQueryDto,
  DailyChecklistResponseDto,
  TickChecklistItemDto,
} from '../dto/daily-checklist.dto';
import { DailyChecklistItemEntity } from '../entities/daily-checklist-item.entity';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { toDailyChecklistResponse } from '../mappers/daily-checklist.mapper';
import {
  assertChecklistGroom,
  assertChecklistNotCancelled,
  assertChecklistRange,
  assertChecklistToday,
} from '../policies/daily-checklist.policy';
import { DailyChecklistsService } from '../shared/daily-checklists.service';
import { StableAccessService } from '../shared/stable-access.service';
import type { ChecklistGenerationResult } from '../types/stable.types';

const CHECKLIST_RELATIONS = {
  horse: true,
  groom: true,
  items: { taskType: true, doer: true },
} as const;

const CHECKLIST_ITEM_NOT_FOUND = 'Không tìm thấy việc trong checklist';

/**
 * Checklist chăm sóc hằng ngày: xem theo ngựa, Groom tick việc, đóng các ngày đã qua, sinh checklist còn thiếu của một ngày
 */
@Injectable()
export class ChecklistsService {
  private readonly logger = new Logger(ChecklistsService.name);

  constructor(
    @InjectRepository(DailyChecklistEntity)
    private readonly checklists: Repository<DailyChecklistEntity>,
    private readonly access: StableAccessService,
    private readonly dailyChecklists: DailyChecklistsService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Liệt kê checklist của ngựa trong khoảng ngày, mới nhất trước
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Khoảng ngày, mặc định hôm nay
   * @returns Promise trả về các checklist của ngựa
   * @throws ForbiddenException Nếu tài khoản không hoạt động, Head Trainer xem ngựa ngoài khu, hoặc Groom xem ngựa không do mình phụ trách
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem
   * @throws BadRequestException Nếu khoảng ngày ngược hoặc dài quá 31 ngày
   */
  async listForHorse(
    actor: Actor,
    horseId: string,
    query: DailyChecklistQueryDto,
  ): Promise<DailyChecklistResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const today = clubToday();
    const from = query.from ?? today;
    const to = query.to ?? from;
    await this.access.findHorseForDailyCare(
      this.dataSource.manager,
      actor,
      caller.id,
      horseId,
    );
    assertChecklistRange(from, to);
    const rows = await this.checklists.find({
      where: { horseId, checklistDate: Between(from, to) },
      relations: CHECKLIST_RELATIONS,
      withDeleted: true,
      order: { checklistDate: 'DESC' },
    });
    return rows.map(toDailyChecklistResponse);
  }

  /**
   * Groom của checklist tick hoặc gỡ tick một việc trong ngày, rồi tính lại trạng thái checklist
   *
   * - Tick lại việc đã xong giữ thời điểm và người tick cũ
   * - Đổi trạng thái xong hoặc ghi chú: ghi nhật ký giá trị trước và sau
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param itemId UUID của việc trong checklist
   * @param body Đã xong hay chưa, ghi chú (null để xóa)
   * @returns Promise trả về checklist sau khi tick
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc checklist không giao cho người gọi
   * @throws NotFoundException Nếu không có việc trong checklist
   * @throws ConflictException Nếu checklist không phải của hôm nay, hoặc đã hủy vì ngựa đã chuyển nhượng hoặc đã mất
   */
  async tick(
    actor: Actor,
    itemId: string,
    body: TickChecklistItemDto,
  ): Promise<DailyChecklistResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const today = clubToday();
    const checklistId = await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOneBy(DailyChecklistItemEntity, {
        id: itemId,
      });
      if (!found) throw new NotFoundException(CHECKLIST_ITEM_NOT_FOUND);
      const checklist = await manager.findOneOrFail(DailyChecklistEntity, {
        where: { id: found.checklistId },
        lock: { mode: 'for_no_key_update' },
      });
      assertChecklistGroom(checklist.groomId, caller.id);
      assertChecklistToday(checklist.checklistDate, today);
      assertChecklistNotCancelled(checklist.status);
      const item = await manager.findOneByOrFail(DailyChecklistItemEntity, {
        id: itemId,
      });
      const before = { done: item.doneAt !== null, note: item.note };
      if (body.done && !item.doneAt) {
        item.doneAt = new Date();
        item.doneBy = caller.id;
      }
      if (!body.done) {
        item.doneAt = null;
        item.doneBy = null;
      }
      if (body.note !== undefined) item.note = body.note?.trim() || null;
      await manager.save(item);
      const diff = changedFieldsDiff(before, {
        done: item.doneAt !== null,
        note: item.note,
      });
      if (diff) {
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.CHECKLIST_ITEM,
          entityId: item.id,
          ...diff,
          feature: AuditFeature.CHECKLIST,
        });
      }
      await this.dailyChecklists.refreshStatus(manager, checklist);
      return checklist.id;
    });
    return toDailyChecklistResponse(
      await this.findWithRelations(this.dataSource.manager, checklistId),
    );
  }

  /**
   * Sinh checklist của một ngày cho các ngựa đang có Groom phụ trách mà chưa có checklist ngày đó
   *
   * - Mỗi ngựa sinh trong một transaction riêng; checklist đã sinh không bị đụng tới
   * - Ngựa lỗi được log và trả về trong failures, các ngựa khác vẫn được sinh
   * - Ngựa không có việc nào trong ngày thì không sinh và không tính là lỗi
   *
   * @param date Ngày cần sinh, YYYY-MM-DD
   * @returns Promise trả về số checklist vừa sinh và các ngựa sinh lỗi
   */
  async generateDay(date: string): Promise<ChecklistGenerationResult> {
    const missing = await this.dataSource.manager
      .createQueryBuilder(GroomAssignmentEntity, 'assignment')
      .withDeleted()
      .innerJoin('assignment.horse', 'horse')
      .select('assignment.horseId', 'horseId')
      .addSelect('horse.name', 'horseName')
      .where('assignment.endAt IS NULL')
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM daily_checklists c WHERE c.horse_id = assignment.horse_id AND c.checklist_date = :date)',
        { date },
      )
      .orderBy('horse.name')
      .getRawMany<{ horseId: string; horseName: string }>();
    const result: ChecklistGenerationResult = { generated: 0, failures: [] };
    for (const { horseId, horseName } of missing) {
      try {
        const id = await this.dataSource.transaction((manager) =>
          this.dailyChecklists.ensureChecklist(manager, horseId, date),
        );
        if (id) result.generated += 1;
      } catch (error) {
        this.logger.error(
          `Sinh checklist ngày ${date} cho ngựa ${horseId} lỗi`,
          error as Error,
        );
        result.failures.push({
          horseId,
          horseName,
          message: (error as Error).message,
        });
      }
    }
    return result;
  }

  /**
   * Chuyển mọi checklist có ngày trước hôm nay còn PENDING hoặc IN_PROGRESS sang INCOMPLETE
   *
   * - Chạy lại bao nhiêu lần cũng cho cùng kết quả
   *
   * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
   * @returns Promise trả về số checklist vừa đóng
   */
  async closePastDays(today: string): Promise<number> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(DailyChecklistEntity)
      .set({ status: DailyChecklistStatus.INCOMPLETE })
      .where('checklist_date < :today', { today })
      .andWhere({ status: In([...OPEN_CHECKLIST_STATUSES]) })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Đọc checklist kèm ngựa, Groom, việc và người tick (kể cả bản đã xóa)
   *
   * @param manager EntityManager dùng để query
   * @param id UUID của checklist
   * @returns Promise trả về checklist đủ quan hệ để map
   */
  private findWithRelations(
    manager: EntityManager,
    id: string,
  ): Promise<DailyChecklistEntity> {
    return manager.findOneOrFail(DailyChecklistEntity, {
      where: { id },
      relations: CHECKLIST_RELATIONS,
      withDeleted: true,
    });
  }
}

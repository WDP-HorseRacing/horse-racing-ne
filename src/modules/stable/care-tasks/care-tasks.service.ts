import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { clubToday } from '../../../common/utils/club-date';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  CareTaskTypeResponseDto,
  CreateCareTaskTypeDto,
  CreateHorseCareTaskDto,
  HorseCareTaskResponseDto,
  UpdateCareTaskTypeDto,
} from '../dto/care-task.dto';
import { CareTaskTypeEntity } from '../entities/care-task-type.entity';
import { HorseCareTaskEntity } from '../entities/horse-care-task.entity';
import {
  toCareTaskTypeResponse,
  toHorseCareTaskResponse,
} from '../mappers/daily-checklist.mapper';
import {
  assertAssignableCareTaskType,
  assertCareTaskRange,
  assertNoOverlappingCareTask,
  careTaskRemovalOf,
} from '../policies/daily-checklist.policy';
import { DailyChecklistsService } from '../shared/daily-checklists.service';
import { StableAccessService } from '../shared/stable-access.service';

const CARE_TASK_TYPE_NOT_FOUND = 'Không tìm thấy loại việc';
const CARE_TASK_TYPE_NAME_TAKEN = 'Tên loại việc đã tồn tại';
const HORSE_CARE_TASK_NOT_FOUND = 'Không tìm thấy việc riêng của ngựa';
const TASK_RELATIONS = { taskType: true, creator: true } as const;

/**
 * Danh mục loại việc chăm sóc (Club Manager) và việc riêng gắn cho từng ngựa (Head Trainer của khu)
 */
@Injectable()
export class CareTasksService {
  constructor(
    @InjectRepository(CareTaskTypeEntity)
    private readonly types: Repository<CareTaskTypeEntity>,
    @InjectRepository(HorseCareTaskEntity)
    private readonly tasks: Repository<HorseCareTaskEntity>,
    private readonly access: StableAccessService,
    private readonly checklists: DailyChecklistsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Liệt kê mọi loại việc theo thứ tự tạo
   *
   * @returns Promise trả về các loại việc, kể cả loại đã ngưng
   */
  async listTypes(): Promise<CareTaskTypeResponseDto[]> {
    const rows = await this.types.find({
      order: { createdAt: 'ASC', name: 'ASC' },
    });
    return rows.map(toCareTaskTypeResponse);
  }

  /**
   * Thêm loại việc; loại mới đang dùng
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Tên và cờ áp mọi ngựa
   * @returns Promise trả về loại việc vừa thêm
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws ConflictException Nếu tên loại việc đã tồn tại
   */
  async createType(
    actor: Actor,
    body: CreateCareTaskTypeDto,
  ): Promise<CareTaskTypeResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const saved = await mapAnyUniqueViolation(
      () =>
        this.types.save(
          this.types.create({
            name: body.name.trim(),
            appliesToAll: body.appliesToAll,
            active: true,
          }),
        ),
      CARE_TASK_TYPE_NAME_TAKEN,
    );
    return toCareTaskTypeResponse(saved);
  }

  /**
   * Sửa tên, cờ áp mọi ngựa hoặc ngưng/dùng lại loại việc; checklist đã sinh không đổi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của loại việc
   * @param body Các field cần sửa, field không gửi giữ giá trị cũ
   * @returns Promise trả về loại việc sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có loại việc
   * @throws ConflictException Nếu tên loại việc đã tồn tại
   */
  async updateType(
    actor: Actor,
    id: string,
    body: UpdateCareTaskTypeDto,
  ): Promise<CareTaskTypeResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const saved = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const type = await manager.findOne(CareTaskTypeEntity, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!type) throw new NotFoundException(CARE_TASK_TYPE_NOT_FOUND);
          Object.assign(type, {
            name: body.name?.trim() ?? type.name,
            appliesToAll: body.appliesToAll ?? type.appliesToAll,
            active: body.active ?? type.active,
          });
          return manager.save(type);
        }),
      CARE_TASK_TYPE_NAME_TAKEN,
    );
    return toCareTaskTypeResponse(saved);
  }

  /**
   * Liệt kê việc riêng của một con ngựa, ngày bắt đầu mới nhất trước
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về các việc riêng của ngựa
   * @throws ForbiddenException Nếu tài khoản không hoạt động, Head Trainer xem ngựa ngoài khu, hoặc Groom xem ngựa không do mình phụ trách
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem
   */
  async listForHorse(
    actor: Actor,
    horseId: string,
  ): Promise<HorseCareTaskResponseDto[]> {
    const manager = this.dataSource.manager;
    const caller = await currentUserForActor(manager, actor);
    await this.access.findHorseForDailyCare(manager, actor, caller.id, horseId);
    const rows = await this.tasks.find({
      where: { horseId },
      relations: TASK_RELATIONS,
      withDeleted: true,
      order: { fromDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(toHorseCareTaskResponse);
  }

  /**
   * Gắn một loại việc cho ngựa trong khoảng ngày; bắt đầu hôm nay thì thêm ngay vào checklist hôm nay đã sinh
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Loại việc, khoảng ngày, ghi chú
   * @returns Promise trả về việc riêng vừa gắn
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có ngựa hoặc loại việc
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất; loại việc đã ngưng hoặc đã áp mọi ngựa; hoặc trùng khoảng ngày
   * @throws BadRequestException Nếu khoảng ngày không hợp lệ
   */
  async createForHorse(
    actor: Actor,
    horseId: string,
    body: CreateHorseCareTaskDto,
  ): Promise<HorseCareTaskResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const today = clubToday();
    const id = await this.dataSource.transaction(async (manager) => {
      await this.access.lockOperableHorse(
        manager,
        caller.id,
        horseId,
        'CARE_TASK',
      );
      assertCareTaskRange(body.fromDate, body.toDate, today);
      const type = await manager.findOneBy(CareTaskTypeEntity, {
        id: body.taskTypeId,
      });
      if (!type) throw new NotFoundException(CARE_TASK_TYPE_NOT_FOUND);
      assertAssignableCareTaskType(type);
      assertNoOverlappingCareTask(
        await manager.exists(HorseCareTaskEntity, {
          where: {
            horseId,
            taskTypeId: type.id,
            fromDate: LessThanOrEqual(body.toDate),
            toDate: MoreThanOrEqual(body.fromDate),
          },
        }),
      );
      const saved = await manager.save(
        manager.create(HorseCareTaskEntity, {
          horseId,
          taskTypeId: type.id,
          fromDate: body.fromDate,
          toDate: body.toDate,
          note: body.note?.trim() || null,
          createdBy: caller.id,
        }),
      );
      if (body.fromDate === today) {
        await this.checklists.addTaskToChecklist(manager, horseId, today, type);
      }
      return saved.id;
    });
    return toHorseCareTaskResponse(
      await this.findWithRelations(this.dataSource.manager, id),
    );
  }

  /**
   * Gỡ việc riêng: chưa bắt đầu thì xóa, đang hiệu lực thì kết thúc ở hôm nay; checklist đã sinh không đổi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của việc riêng
   * @returns Promise hoàn tất khi đã gỡ
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có việc riêng hoặc ngựa
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất, hoặc việc đã kết thúc
   */
  async removeForHorse(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const today = clubToday();
    await this.dataSource.transaction(async (manager) => {
      const task = await manager.findOneBy(HorseCareTaskEntity, { id });
      if (!task) throw new NotFoundException(HORSE_CARE_TASK_NOT_FOUND);
      await this.access.lockOperableHorse(
        manager,
        caller.id,
        task.horseId,
        'CARE_TASK',
      );
      if (careTaskRemovalOf(task.fromDate, task.toDate, today) === 'DELETE') {
        await manager.delete(HorseCareTaskEntity, { id });
        return;
      }
      await manager.update(HorseCareTaskEntity, { id }, { toDate: today });
    });
  }

  /**
   * Đọc việc riêng kèm loại việc và người gắn (kể cả bản đã xóa)
   *
   * @param manager EntityManager dùng để query
   * @param id UUID của việc riêng
   * @returns Promise trả về việc riêng đủ quan hệ để map
   * @throws NotFoundException Nếu không có việc riêng
   */
  private async findWithRelations(
    manager: EntityManager,
    id: string,
  ): Promise<HorseCareTaskEntity> {
    const task = await manager.findOne(HorseCareTaskEntity, {
      where: { id },
      relations: TASK_RELATIONS,
      withDeleted: true,
    });
    if (!task) throw new NotFoundException(HORSE_CARE_TASK_NOT_FOUND);
    return task;
  }
}

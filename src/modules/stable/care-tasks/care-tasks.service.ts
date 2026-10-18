import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { clubToday, shiftDays } from '../../../common/utils/club-date';
import type { FieldError } from '../../../common/utils/field-errors';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  currentUserForActor,
  type CurrentActorUser,
} from '../../users/utils/current-user';
import {
  CareTaskTypeResponseDto,
  CreateCareTaskTypeDto,
  CreateHorseCareTaskDto,
  HorseCareTaskResponseDto,
  UpdateCareTaskTypeDto,
} from '../dto/care-task.dto';
import { HorseCareTaskMode } from '../constants/horse-care-task-mode.enum';
import { CARE_TASK_CHANGED_EVENT } from '../constants/stable-events.constants';
import { CareTaskTypeEntity } from '../entities/care-task-type.entity';
import { HorseCareTaskEntity } from '../entities/horse-care-task.entity';
import {
  toCareTaskTypeResponse,
  toHorseCareTaskResponse,
} from '../mappers/daily-checklist.mapper';
import {
  assertAppliesToAllChangeable,
  assertAssignableCareTaskType,
  assertCareTaskRange,
  assertExemptionReason,
  assertNoOverlappingCareTask,
  careTaskRemovalOf,
} from '../policies/daily-checklist.policy';
import { DailyChecklistsService } from '../shared/daily-checklists.service';
import { StableAccessService } from '../shared/stable-access.service';
import type { CareTaskChangedEvent } from '../types/stable-events.types';

const CARE_TASK_TYPE_NOT_FOUND = 'Không tìm thấy loại việc';
const CARE_TASK_TYPE_NAME_TAKEN: FieldError = {
  field: 'name',
  message: 'Tên loại việc đã tồn tại',
};
const HORSE_CARE_TASK_NOT_FOUND = 'Không tìm thấy việc riêng của ngựa';
const TASK_RELATIONS = { taskType: true, creator: true } as const;

/**
 * Danh mục loại việc chăm sóc (Club Manager) và việc riêng gắn cho từng ngựa (Head Trainer của khu, Veterinarian mọi ngựa)
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
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
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
   * - Ghi nhật ký kèm tên, cờ áp mọi ngựa, trạng thái dùng
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
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const saved = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const type = await manager.save(
            manager.create(CareTaskTypeEntity, {
              name: body.name.trim(),
              appliesToAll: body.appliesToAll,
              active: true,
            }),
          );
          await this.auditService.record(manager, {
            actorId: caller.id,
            action: AuditAction.CREATE,
            entityType: AuditEntityType.CARE_TASK_TYPE,
            entityId: type.id,
            before: null,
            after: careTaskTypeAuditData(type),
            feature: AuditFeature.CARE_TASK,
          });
          return type;
        }),
      CARE_TASK_TYPE_NAME_TAKEN,
    );
    return toCareTaskTypeResponse(saved);
  }

  /**
   * Sửa tên, cờ áp mọi ngựa hoặc ngưng/dùng lại loại việc; checklist đã sinh không đổi
   *
   * - Đổi cờ áp mọi ngựa khi còn ngựa được gắn thêm hoặc được miễn loại này chưa hết hạn: 409
   * - Có field đổi giá trị: ghi nhật ký giá trị trước và sau của các field đó
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của loại việc
   * @param body Các field cần sửa, field không gửi giữ giá trị cũ
   * @returns Promise trả về loại việc sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có loại việc
   * @throws ConflictException Nếu tên loại việc đã tồn tại, hoặc đổi cờ áp mọi ngựa khi còn dòng việc riêng chưa hết hạn
   */
  async updateType(
    actor: Actor,
    id: string,
    body: UpdateCareTaskTypeDto,
  ): Promise<CareTaskTypeResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const saved = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const type = await manager.findOne(CareTaskTypeEntity, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!type) throw new NotFoundException(CARE_TASK_TYPE_NOT_FOUND);
          const changingAppliesToAll =
            body.appliesToAll !== undefined &&
            body.appliesToAll !== type.appliesToAll;
          assertAppliesToAllChangeable(
            changingAppliesToAll,
            changingAppliesToAll &&
              (await manager.exists(HorseCareTaskEntity, {
                where: { taskTypeId: id, toDate: MoreThanOrEqual(clubToday()) },
              })),
          );
          const before = careTaskTypeAuditData(type);
          Object.assign(type, {
            name: body.name?.trim() ?? type.name,
            appliesToAll: body.appliesToAll ?? type.appliesToAll,
            active: body.active ?? type.active,
          });
          const updated = await manager.save(type);
          const diff = changedFieldsDiff(
            before,
            careTaskTypeAuditData(updated),
          );
          if (diff) {
            await this.auditService.record(manager, {
              actorId: caller.id,
              action: AuditAction.UPDATE,
              entityType: AuditEntityType.CARE_TASK_TYPE,
              entityId: id,
              ...diff,
              feature: AuditFeature.CARE_TASK,
            });
          }
          return updated;
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
   * @throws ForbiddenException Nếu tài khoản không hoạt động, Head Trainer xem ngựa ngoài khu, hoặc Groom xem ngựa không do mình phụ trách (Veterinarian xem mọi ngựa)
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
   * Gắn thêm hoặc miễn một loại việc cho ngựa trong khoảng ngày
   *
   * - Gắn thêm bắt đầu hôm nay: thêm ngay vào checklist hôm nay (chưa có thì sinh)
   * - Miễn bắt đầu hôm nay: bỏ việc đó khỏi checklist hôm nay nếu chưa tick; đã tick thì giữ
   * - Ghi nhật ký kèm ngựa, loại việc, kiểu dòng, khoảng ngày, ghi chú
   * - Người gọi không phải Head Trainer của khu (Veterinarian): phát CARE_TASK_CHANGED_EVENT để báo Head Trainer của khu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Loại việc, kiểu dòng (mặc định gắn thêm), khoảng ngày, ghi chú (lý do miễn)
   * @returns Promise trả về việc riêng vừa gắn
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc người gọi không phải Veterinarian và ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có ngựa hoặc loại việc
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất, Head Trainer gắn cho ngựa chưa có khu; loại việc đã ngưng, gắn thêm loại đã áp mọi ngựa hoặc miễn loại không áp mọi ngựa; hoặc trùng khoảng ngày
   * @throws BadRequestException Nếu khoảng ngày không hợp lệ, hoặc miễn mà không có lý do
   */
  async createForHorse(
    actor: Actor,
    horseId: string,
    body: CreateHorseCareTaskDto,
  ): Promise<HorseCareTaskResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const today = clubToday();
    const mode = body.mode ?? HorseCareTaskMode.EXTRA;
    const note = body.note?.trim() || null;
    const id = await this.dataSource.transaction(async (manager) => {
      const { inTrainerBarn } = await this.access.lockCareTaskHorse(
        manager,
        actor,
        caller.id,
        horseId,
      );
      assertCareTaskRange(body.fromDate, body.toDate, today);
      assertExemptionReason(mode, note);
      const type = await manager.findOneBy(CareTaskTypeEntity, {
        id: body.taskTypeId,
      });
      if (!type) throw new NotFoundException(CARE_TASK_TYPE_NOT_FOUND);
      assertAssignableCareTaskType(type, mode);
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
          mode,
          fromDate: body.fromDate,
          toDate: body.toDate,
          note,
          createdBy: caller.id,
        }),
      );
      if (body.fromDate === today && mode === HorseCareTaskMode.EXTRA) {
        await this.checklists.ensureChecklist(manager, horseId, today);
        await this.checklists.addTaskToChecklist(manager, horseId, today, type);
      }
      if (body.fromDate === today && mode === HorseCareTaskMode.EXEMPT) {
        await this.checklists.removeUntickedTaskFromChecklist(
          manager,
          horseId,
          today,
          type.id,
        );
      }
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.HORSE_CARE_TASK,
        entityId: saved.id,
        before: null,
        after: {
          horseId,
          taskTypeId: type.id,
          mode,
          fromDate: saved.fromDate,
          toDate: saved.toDate,
          note: saved.note,
        },
        feature: AuditFeature.CARE_TASK,
      });
      if (!inTrainerBarn) {
        await this.publishVeterinarianChange(
          manager,
          caller,
          'ADDED',
          saved,
          type.name,
        );
      }
      return saved.id;
    });
    return toHorseCareTaskResponse(
      await this.findWithRelations(this.dataSource.manager, id),
    );
  }

  /**
   * Gỡ việc riêng của ngựa theo kiểu dòng
   *
   * - Gắn thêm: chưa bắt đầu thì xóa, đang hiệu lực thì kết thúc ở hôm nay; checklist đã sinh không đổi
   * - Miễn: bắt đầu từ hôm nay trở đi thì xóa, bắt đầu trước hôm nay thì kết thúc ở hôm qua; việc chung có lại ngay trong checklist hôm nay (nếu loại việc còn dùng và còn áp mọi ngựa) và báo Groom
   * - Ghi nhật ký: xóa kèm nội dung dòng, hoặc kết thúc kèm ngày kết thúc trước và sau
   * - Người gọi không phải Head Trainer của khu (Veterinarian): phát CARE_TASK_CHANGED_EVENT để báo Head Trainer của khu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của việc riêng
   * @returns Promise hoàn tất khi đã gỡ
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc người gọi không phải Veterinarian và ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có việc riêng hoặc ngựa
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất, Head Trainer gỡ việc của ngựa chưa có khu, hoặc việc đã kết thúc
   */
  async removeForHorse(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const today = clubToday();
    await this.dataSource.transaction(async (manager) => {
      const task = await manager.findOneBy(HorseCareTaskEntity, { id });
      if (!task) throw new NotFoundException(HORSE_CARE_TASK_NOT_FOUND);
      const { inTrainerBarn } = await this.access.lockCareTaskHorse(
        manager,
        actor,
        caller.id,
        task.horseId,
      );
      const removal = careTaskRemovalOf(
        task.mode,
        task.fromDate,
        task.toDate,
        today,
      );
      if (removal === 'DELETE') {
        await manager.delete(HorseCareTaskEntity, { id });
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.DELETE,
          entityType: AuditEntityType.HORSE_CARE_TASK,
          entityId: id,
          before: {
            horseId: task.horseId,
            taskTypeId: task.taskTypeId,
            mode: task.mode,
            fromDate: task.fromDate,
            toDate: task.toDate,
          },
          after: null,
          feature: AuditFeature.CARE_TASK,
        });
      } else {
        const toDate = removal === 'END_TODAY' ? today : shiftDays(today, -1);
        await manager.update(HorseCareTaskEntity, { id }, { toDate });
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.HORSE_CARE_TASK,
          entityId: id,
          before: { toDate: task.toDate },
          after: { toDate },
          feature: AuditFeature.CARE_TASK,
        });
      }
      if (task.mode === HorseCareTaskMode.EXEMPT) {
        await this.restoreSharedTaskToday(manager, task, today);
      }
      if (!inTrainerBarn) {
        const type = await manager.findOneByOrFail(CareTaskTypeEntity, {
          id: task.taskTypeId,
        });
        await this.publishVeterinarianChange(
          manager,
          caller,
          'REMOVED',
          task,
          type.name,
        );
      }
    });
  }

  /**
   * Ghi vào outbox event bác sĩ vừa gắn thêm, miễn hoặc gỡ việc riêng của ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param veterinarian Bác sĩ đã đổi
   * @param action ADDED khi gắn dòng mới, REMOVED khi gỡ dòng
   * @param task Dòng việc riêng (dòng bị gỡ: giá trị trước khi gỡ)
   * @param taskName Tên loại việc
   * @returns Promise hoàn tất khi đã ghi event
   */
  private async publishVeterinarianChange(
    manager: EntityManager,
    veterinarian: CurrentActorUser,
    action: CareTaskChangedEvent['action'],
    task: HorseCareTaskEntity,
    taskName: string,
  ): Promise<void> {
    const event: CareTaskChangedEvent = {
      eventId: randomUUID(),
      horseId: task.horseId,
      action,
      mode: task.mode,
      taskName,
      fromDate: task.fromDate,
      toDate: task.toDate,
      note: task.note,
      veterinarianId: veterinarian.id,
      veterinarianName: veterinarian.fullName,
    };
    await this.events.publish(manager, CARE_TASK_CHANGED_EVENT, event);
  }

  /**
   * Thêm lại việc chung vào checklist hôm nay sau khi đã gỡ dòng miễn đang che hôm nay
   *
   * - Dòng miễn chưa tới ngày bắt đầu, hoặc loại việc đã ngưng hay không còn áp mọi ngựa: không thêm
   * - Hôm nay chưa có checklist (ngựa có Groom) thì sinh; đã có thì thêm việc và báo Groom
   *
   * @param manager EntityManager của transaction đang chạy
   * @param exemption Dòng miễn vừa gỡ (giá trị trước khi gỡ)
   * @param today Hôm nay theo lịch CLB, YYYY-MM-DD
   * @returns Promise hoàn tất khi đã thêm hoặc bỏ qua
   */
  private async restoreSharedTaskToday(
    manager: EntityManager,
    exemption: HorseCareTaskEntity,
    today: string,
  ): Promise<void> {
    if (exemption.fromDate > today) return;
    const type = await manager.findOneBy(CareTaskTypeEntity, {
      id: exemption.taskTypeId,
    });
    if (!type?.active || !type.appliesToAll) return;
    await this.checklists.ensureChecklist(manager, exemption.horseId, today);
    await this.checklists.addTaskToChecklist(
      manager,
      exemption.horseId,
      today,
      type,
    );
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

/**
 * Lấy các field của loại việc được ghi nhật ký
 *
 * @param type Loại việc
 * @returns Tên, cờ áp mọi ngựa, trạng thái dùng
 */
function careTaskTypeAuditData(type: CareTaskTypeEntity) {
  return {
    name: type.name,
    appliesToAll: type.appliesToAll,
    active: type.active,
  };
}

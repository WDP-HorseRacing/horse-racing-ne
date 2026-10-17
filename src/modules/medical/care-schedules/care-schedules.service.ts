import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { UserEntity } from '../../users/entities/user.entity';
import {
  CareAssigneeType,
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import {
  CancelCareScheduleDto,
  CareScheduleResponseDto,
  CompleteCareScheduleDto,
  CompleteCareScheduleResponseDto,
  CreateCareScheduleDto,
  UpdateCareScheduleDto,
} from '../dto';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { toCareScheduleResponse } from '../mappers/medical.mapper';
import {
  assertCanCompleteCareSchedule,
  assertCanScheduleNext,
  assertCareAssigneeAllowed,
  assertCareDueDate,
  assertCareScheduleOpen,
  assertRescheduleReason,
  careAssignment,
  isCareScheduleDoer,
  isGroomOnly,
} from '../policies/medical.policy';
import { toClubDate } from '../../../common/utils/club-date';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

/**
 * Vai trò tài khoản ứng với từng kiểu giao khi giao cho người cụ thể
 */
const ASSIGNEE_ROLE: Record<CareAssigneeType, UserRole> = {
  [CareAssigneeType.GROOM]: UserRole.GROOM,
  [CareAssigneeType.VET]: UserRole.VETERINARIAN,
};

/**
 * Câu báo khi người cụ thể được giao không đúng vai trò hoặc không hoạt động
 */
const INVALID_ASSIGNEE_MESSAGE: Record<CareAssigneeType, string> = {
  [CareAssigneeType.GROOM]: 'Người được giao phải là Groom đang hoạt động',
  [CareAssigneeType.VET]: 'Người được giao phải là Bác sĩ thú y đang hoạt động',
};

/**
 * Kiểu giao và người được giao của một lịch chăm sóc
 */
interface CareAssignment {
  assigneeType: CareAssigneeType | null;
  assignedTo: string | null;
}

@Injectable()
export class CareSchedulesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CareScheduleEntity)
    private readonly schedules: Repository<CareScheduleEntity>,
    private readonly access: MedicalAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lịch tiêm phòng, tẩy giun, kiểm tra móng của con ngựa, ngày đến hạn gần nhất lên trên
   *
   * - Không gồm ngày hẹn khám định kỳ
   * - Người chỉ có vai trò Groom chỉ thấy lịch mình là người làm: giao đích danh cho mình, hoặc giao Groom phụ trách khi mình đang phụ trách con ngựa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về các lịch chăm sóc
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async list(
    actor: Actor,
    horseId: string,
  ): Promise<CareScheduleResponseDto[]> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const caller = await this.horseAccess.currentUser(actor);
    const schedules = await this.schedules.find({
      where: { horseId, type: Not(CareScheduleType.ROUTINE_CHECKUP) },
      order: { dueAt: 'ASC' },
    });
    if (!isGroomOnly(actor.roles)) {
      return schedules.map(toCareScheduleResponse);
    }
    const isHorseGroom = await this.horseAccess.isGroomAssigned(
      horseId,
      caller.id,
    );
    return schedules
      .filter((schedule) =>
        isCareScheduleDoer(schedule, caller.id, isHorseGroom),
      )
      .map(toCareScheduleResponse);
  }

  /**
   * Bác sĩ tạo lịch chăm sóc cho con ngựa
   *
   * - Khóa row ngựa; ngựa đã chuyển nhượng: 409
   * - Ngày đến hạn không ở quá khứ
   * - Giao Groom: bỏ trống người là Groom đang phụ trách ngựa, có người thì phải là Groom đang hoạt động; giao bác sĩ: bắt buộc bác sĩ đang hoạt động; không có kiểu giao thì không được chọn người
   * - Tiêm phòng, tẩy giun không được giao Groom
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Loại, ngày đến hạn, người được giao, ghi chú
   * @returns Promise trả về lịch vừa tạo
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu ngày đến hạn ở quá khứ, kiểu giao và người được giao không khớp, tiêm phòng hoặc tẩy giun giao Groom, hoặc người được giao không hợp lệ
   * @throws ConflictException Nếu ngựa đã chuyển nhượng
   */
  async create(
    actor: Actor,
    horseId: string,
    body: CreateCareScheduleDto,
  ): Promise<CareScheduleResponseDto> {
    const dueAt = new Date(body.dueAt);
    const created = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      assertCareDueDate(toClubDate(dueAt), toClubDate(new Date()));
      const assignment = careAssignment(body.assigneeType, body.assignedTo);
      assertCareAssigneeAllowed(body.type, assignment.assigneeType);
      await this.assertAssignee(manager, assignment);
      const saved = await manager.save(
        manager.create(CareScheduleEntity, {
          horseId,
          type: body.type,
          dueAt,
          ...assignment,
          status: CareScheduleStatus.SCHEDULED,
          completedAt: null,
          completedBy: null,
          cancelReason: null,
          notes: body.notes ?? null,
        }),
      );
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: saved.id,
        before: null,
        after: {
          horseId,
          type: body.type,
          dueAt,
          assigneeType: saved.assigneeType,
          assignedTo: saved.assignedTo,
        },
        feature: MEDICAL_AUDIT_FEATURE.CARE_SCHEDULE,
      });
      return saved;
    });
    return toCareScheduleResponse(created);
  }

  /**
   * Bác sĩ dời ngày, đổi người được giao hoặc ghi chú của lịch chăm sóc
   *
   * - Chỉ lịch còn Đã lên lịch: 409
   * - Dời ngày bắt buộc lý do; ngày mới không ở quá khứ
   * - Đổi cách giao: gửi assigneeType (kèm assignedTo nếu giao người cụ thể), cùng luật như khi tạo (kể cả tiêm phòng, tẩy giun không được giao Groom); không đổi cách giao thì không kiểm luật loại lịch; gửi assignedTo mà không gửi assigneeType: 400
   * - Không có trường nào thay đổi thì không ghi gì, không ghi nhật ký
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param scheduleId UUID của lịch chăm sóc
   * @param body Các trường cần đổi và lý do
   * @returns Promise trả về lịch sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lịch, hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu dời ngày không có lý do, ngày ở quá khứ, kiểu giao và người được giao không khớp, đổi lịch tiêm phòng hoặc tẩy giun sang giao Groom, hoặc người được giao không hợp lệ
   * @throws ConflictException Nếu lịch đã hoàn tất hoặc đã hủy, hoặc ngựa đã chuyển nhượng
   */
  async update(
    actor: Actor,
    scheduleId: string,
    body: UpdateCareScheduleDto,
  ): Promise<CareScheduleResponseDto> {
    const { horseId } = await this.findSchedule(scheduleId);
    const updated = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const schedule = await this.lockSchedule(manager, scheduleId);
      assertCareScheduleOpen(schedule.status);
      const dueAt = body.dueAt ? new Date(body.dueAt) : schedule.dueAt;
      const dueChanged = dueAt.getTime() !== schedule.dueAt.getTime();
      assertRescheduleReason(dueChanged, body.reason);
      if (dueChanged) {
        assertCareDueDate(toClubDate(dueAt), toClubDate(new Date()));
      }
      const reassigned =
        body.assigneeType !== undefined || body.assignedTo !== undefined;
      const assignment = reassigned
        ? careAssignment(body.assigneeType, body.assignedTo)
        : {
            assigneeType: schedule.assigneeType,
            assignedTo: schedule.assignedTo,
          };
      if (reassigned) {
        assertCareAssigneeAllowed(schedule.type, assignment.assigneeType);
      }
      await this.assertAssignee(manager, assignment);
      const changes = {
        dueAt,
        ...assignment,
        notes: body.notes !== undefined ? body.notes : schedule.notes,
      };
      if (
        !dueChanged &&
        changes.assigneeType === schedule.assigneeType &&
        changes.assignedTo === schedule.assignedTo &&
        changes.notes === schedule.notes
      ) {
        return schedule;
      }
      await manager.update(CareScheduleEntity, { id: scheduleId }, changes);
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: scheduleId,
        before: {
          dueAt: schedule.dueAt,
          assigneeType: schedule.assigneeType,
          assignedTo: schedule.assignedTo,
          notes: schedule.notes,
        },
        after: changes,
        reason: body.reason ?? null,
        feature: MEDICAL_AUDIT_FEATURE.CARE_SCHEDULE,
      });
      return { ...schedule, ...changes };
    });
    return toCareScheduleResponse(updated);
  }

  /**
   * Đánh dấu hoàn tất lịch chăm sóc, lưu thời điểm và người thực hiện
   *
   * - Veterinarian, hoặc Groom là người làm lịch (giao đích danh cho mình, hoặc giao Groom phụ trách khi mình đang phụ trách con ngựa); người khác: 403
   * - Chỉ lịch còn Đã lên lịch: 409
   * - Bác sĩ có thể nhập ngày đến hạn lần tới: tạo luôn lịch mới cùng loại trong cùng transaction, giữ cách giao (createNext)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param scheduleId UUID của lịch chăm sóc
   * @param body Ngày đến hạn lần tới (tùy chọn, chỉ Veterinarian)
   * @returns Promise trả về lịch vừa hoàn tất và lịch lần tới (nếu có)
   * @throws NotFoundException Nếu không có lịch, hoặc ngựa ngoài phạm vi
   * @throws ForbiddenException Nếu tài khoản không hoạt động, người gọi không được hoàn tất lịch này, hoặc không phải Veterinarian mà nhập ngày lần tới
   * @throws BadRequestException Nếu ngày đến hạn lần tới ở quá khứ
   * @throws ConflictException Nếu lịch đã hoàn tất hoặc đã hủy, hoặc ngựa đã chuyển nhượng
   */
  async complete(
    actor: Actor,
    scheduleId: string,
    body: CompleteCareScheduleDto,
  ): Promise<CompleteCareScheduleResponseDto> {
    const { horseId } = await this.findSchedule(scheduleId);
    const result = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const schedule = await this.lockSchedule(manager, scheduleId);
      const isDoer = isCareScheduleDoer(
        schedule,
        caller.id,
        await this.horseAccess.isGroomAssigned(horseId, caller.id, manager),
      );
      assertCanCompleteCareSchedule(actor.roles, isDoer);
      assertCareScheduleOpen(schedule.status);
      const nextDueAt = body.nextDueAt ? new Date(body.nextDueAt) : null;
      assertCanScheduleNext(actor.roles, nextDueAt !== null);
      if (nextDueAt) {
        assertCareDueDate(toClubDate(nextDueAt), toClubDate(new Date()));
      }
      const changes = {
        status: CareScheduleStatus.COMPLETED,
        completedAt: new Date(),
        completedBy: caller.id,
      };
      await manager.update(CareScheduleEntity, { id: scheduleId }, changes);
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: scheduleId,
        before: { status: schedule.status },
        after: { status: CareScheduleStatus.COMPLETED },
        feature: MEDICAL_AUDIT_FEATURE.CARE_SCHEDULE,
      });
      const next = nextDueAt
        ? await this.createNext(manager, schedule, nextDueAt, caller.id)
        : null;
      return {
        completed: { ...schedule, ...changes },
        next,
      };
    });
    return {
      completed: toCareScheduleResponse(result.completed),
      next: result.next ? toCareScheduleResponse(result.next) : null,
    };
  }

  /**
   * Bác sĩ hủy lịch chăm sóc, bắt buộc lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param scheduleId UUID của lịch chăm sóc
   * @param body Lý do hủy
   * @returns Promise trả về lịch sau khi hủy
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lịch, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu lịch đã hoàn tất hoặc đã hủy, hoặc ngựa đã chuyển nhượng
   */
  async cancel(
    actor: Actor,
    scheduleId: string,
    body: CancelCareScheduleDto,
  ): Promise<CareScheduleResponseDto> {
    const { horseId } = await this.findSchedule(scheduleId);
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const schedule = await this.lockSchedule(manager, scheduleId);
      assertCareScheduleOpen(schedule.status);
      const changes = {
        status: CareScheduleStatus.CANCELLED,
        cancelReason: body.reason,
      };
      await manager.update(CareScheduleEntity, { id: scheduleId }, changes);
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: scheduleId,
        before: { status: schedule.status },
        after: { status: CareScheduleStatus.CANCELLED },
        reason: body.reason,
        feature: MEDICAL_AUDIT_FEATURE.CARE_SCHEDULE,
      });
      return { ...schedule, ...changes };
    });
    return toCareScheduleResponse(cancelled);
  }

  /**
   * Tạo lịch lần tới cùng loại sau khi hoàn tất, giữ cách giao của lịch vừa hoàn tất
   *
   * - Người cụ thể không còn hợp lệ: giao Groom thì về Groom đang phụ trách ngựa, giao bác sĩ thì về chưa giao ai
   *
   * @param manager EntityManager của transaction đang chạy
   * @param done Lịch vừa hoàn tất
   * @param dueAt Ngày đến hạn lần tới
   * @param callerId UUID bác sĩ tạo lịch
   * @returns Promise trả về lịch lần tới vừa tạo
   */
  private async createNext(
    manager: EntityManager,
    done: CareScheduleEntity,
    dueAt: Date,
    callerId: string,
  ): Promise<CareScheduleEntity> {
    const assignment: CareAssignment = (await this.isValidAssignee(
      manager,
      done,
    ))
      ? { assigneeType: done.assigneeType, assignedTo: done.assignedTo }
      : done.assigneeType === CareAssigneeType.GROOM
        ? { assigneeType: CareAssigneeType.GROOM, assignedTo: null }
        : { assigneeType: null, assignedTo: null };
    const next = await manager.save(
      manager.create(CareScheduleEntity, {
        horseId: done.horseId,
        type: done.type,
        dueAt,
        ...assignment,
        status: CareScheduleStatus.SCHEDULED,
        completedAt: null,
        completedBy: null,
        cancelReason: null,
        notes: null,
      }),
    );
    await this.audit.record(manager, {
      actorId: callerId,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.CARE_SCHEDULE,
      entityId: next.id,
      before: null,
      after: {
        horseId: done.horseId,
        type: done.type,
        dueAt,
        assigneeType: next.assigneeType,
        assignedTo: next.assignedTo,
        previousScheduleId: done.id,
      },
      feature: MEDICAL_AUDIT_FEATURE.CARE_SCHEDULE,
    });
    return next;
  }

  /**
   * Kiểm người cụ thể được giao có đúng vai trò của kiểu giao và đang hoạt động không
   *
   * @param manager EntityManager của transaction đang chạy
   * @param assignment Kiểu giao và người được giao
   * @returns Promise hoàn tất khi kiểm xong; không giao người cụ thể thì không kiểm
   * @throws BadRequestException Nếu người được giao không phải Groom (giao Groom) hoặc bác sĩ (giao bác sĩ) đang hoạt động
   */
  private async assertAssignee(
    manager: EntityManager,
    assignment: CareAssignment,
  ): Promise<void> {
    if (
      assignment.assigneeType !== null &&
      !(await this.isValidAssignee(manager, assignment))
    ) {
      throw new BadRequestException(
        INVALID_ASSIGNEE_MESSAGE[assignment.assigneeType],
      );
    }
  }

  /**
   * Kiểm cách giao của lịch còn hợp lệ không
   *
   * - Không giao người cụ thể (kể cả chưa giao ai): luôn hợp lệ
   * - Giao người cụ thể: người đó đang hoạt động và có vai trò ứng với kiểu giao
   *
   * @param manager EntityManager của transaction đang chạy
   * @param assignment Kiểu giao và người được giao
   * @returns Promise trả về true nếu hợp lệ
   */
  private async isValidAssignee(
    manager: EntityManager,
    assignment: CareAssignment,
  ): Promise<boolean> {
    if (assignment.assignedTo === null || assignment.assigneeType === null) {
      return true;
    }
    return manager.exists(UserEntity, {
      where: {
        id: assignment.assignedTo,
        status: UserStatus.ACTIVE,
        role: ASSIGNEE_ROLE[assignment.assigneeType],
      },
    });
  }

  /**
   * Tìm lịch chăm sóc (không gồm ngày hẹn khám định kỳ) theo id
   *
   * @param scheduleId UUID của lịch chăm sóc
   * @returns Promise trả về lịch chăm sóc
   * @throws NotFoundException Nếu không có lịch
   */
  private async findSchedule(scheduleId: string): Promise<CareScheduleEntity> {
    const schedule = await this.schedules.findOne({
      where: { id: scheduleId, type: Not(CareScheduleType.ROUTINE_CHECKUP) },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy lịch chăm sóc');
    return schedule;
  }

  /**
   * Khóa row lịch chăm sóc trong transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param scheduleId UUID của lịch chăm sóc
   * @returns Promise trả về lịch đã khóa
   */
  private lockSchedule(
    manager: EntityManager,
    scheduleId: string,
  ): Promise<CareScheduleEntity> {
    return manager.findOneOrFail(CareScheduleEntity, {
      where: { id: scheduleId },
      lock: { mode: 'pessimistic_write' },
    });
  }
}

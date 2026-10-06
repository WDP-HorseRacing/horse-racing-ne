import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { UserEntity } from '../../users/entities/user.entity';
import {
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
  assertCareDueDate,
  assertCareScheduleOpen,
  assertRescheduleReason,
  isGroomOnly,
} from '../policies/medical.policy';
import { toClubDate } from '../../../common/utils/club-date';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

/**
 * Vai trò được giao thực hiện lịch chăm sóc.
 */
const ASSIGNABLE_ROLES = [UserRole.VETERINARIAN, UserRole.GROOM];

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
   * - Người chỉ có vai trò Groom chỉ thấy lịch được giao cho mình, và chỉ khi vẫn đang phụ trách con ngựa
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
    const groomOnly = isGroomOnly(actor.roles);
    if (
      groomOnly &&
      !(await this.horseAccess.isGroomAssigned(horseId, caller.id))
    ) {
      return [];
    }
    const schedules = await this.schedules.find({
      where: {
        horseId,
        type: Not(CareScheduleType.ROUTINE_CHECKUP),
        ...(groomOnly ? { assignedTo: caller.id } : {}),
      },
      order: { dueAt: 'ASC' },
    });
    return schedules.map(toCareScheduleResponse);
  }

  /**
   * Bác sĩ tạo lịch chăm sóc cho con ngựa
   *
   * - Khóa row ngựa; ngựa đã chuyển nhượng: 409
   * - Ngày đến hạn không ở quá khứ; người được giao phải là Veterinarian hoặc Groom đang hoạt động
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Loại, ngày đến hạn, người được giao, ghi chú
   * @returns Promise trả về lịch vừa tạo
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu ngày đến hạn ở quá khứ, hoặc người được giao không hợp lệ
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
      await this.assertAssignee(manager, horseId, body.assignedTo);
      const saved = await manager.save(
        manager.create(CareScheduleEntity, {
          horseId,
          type: body.type,
          dueAt,
          assignedTo: body.assignedTo ?? null,
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
   * - Không có trường nào thay đổi thì không ghi gì, không ghi nhật ký
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param scheduleId UUID của lịch chăm sóc
   * @param body Các trường cần đổi và lý do
   * @returns Promise trả về lịch sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lịch, hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu dời ngày không có lý do, ngày ở quá khứ, hoặc người được giao không hợp lệ
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
      await this.assertAssignee(manager, horseId, body.assignedTo);
      const changes = {
        dueAt,
        assignedTo:
          body.assignedTo !== undefined ? body.assignedTo : schedule.assignedTo,
        notes: body.notes !== undefined ? body.notes : schedule.notes,
      };
      if (
        !dueChanged &&
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
   * - Veterinarian, hoặc đúng Groom được giao mà vẫn đang phụ trách con ngựa; người khác: 403
   * - Chỉ lịch còn Đã lên lịch: 409
   * - Bác sĩ có thể nhập ngày đến hạn lần tới: tạo luôn lịch mới cùng loại trong cùng transaction, giữ người được giao nếu vẫn hợp lệ
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
      const isActiveAssignee =
        schedule.assignedTo === caller.id &&
        (actor.roles.includes(UserRole.VETERINARIAN) ||
          (await this.horseAccess.isGroomAssigned(
            horseId,
            caller.id,
            manager,
          )));
      assertCanCompleteCareSchedule(actor.roles, isActiveAssignee);
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
   * Tạo lịch lần tới cùng loại sau khi hoàn tất, giữ người được giao nếu vẫn hợp lệ
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
    const keepAssignee =
      done.assignedTo !== null &&
      (await this.isValidAssignee(manager, done.horseId, done.assignedTo));
    const next = await manager.save(
      manager.create(CareScheduleEntity, {
        horseId: done.horseId,
        type: done.type,
        dueAt,
        assignedTo: keepAssignee ? done.assignedTo : null,
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
        assignedTo: next.assignedTo,
        previousScheduleId: done.id,
      },
      feature: MEDICAL_AUDIT_FEATURE.CARE_SCHEDULE,
    });
    return next;
  }

  /**
   * Người được giao phải là Veterinarian đang hoạt động, hoặc Groom đang hoạt động và đang phụ trách con ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param userId UUID người được giao; bỏ trống hoặc null thì không kiểm
   * @returns Promise hoàn tất khi kiểm xong
   * @throws BadRequestException Nếu người được giao không hợp lệ
   */
  private async assertAssignee(
    manager: EntityManager,
    horseId: string,
    userId: string | null | undefined,
  ): Promise<void> {
    if (!userId) return;
    if (!(await this.isValidAssignee(manager, horseId, userId))) {
      throw new BadRequestException(
        'Người được giao phải là Bác sĩ thú y đang hoạt động, hoặc Groom đang hoạt động và đang phụ trách con ngựa',
      );
    }
  }

  /**
   * Kiểm một người có được giao lịch chăm sóc của con ngựa không
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param userId UUID người được giao
   * @returns Promise trả về true nếu là Veterinarian đang hoạt động, hoặc Groom đang hoạt động và đang phụ trách con ngựa
   */
  private async isValidAssignee(
    manager: EntityManager,
    horseId: string,
    userId: string,
  ): Promise<boolean> {
    const user = await manager.findOne(UserEntity, {
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        role: In(ASSIGNABLE_ROLES),
      },
    });
    if (!user) return false;
    return user.role === UserRole.GROOM
      ? this.horseAccess.isGroomAssigned(horseId, userId, manager)
      : true;
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

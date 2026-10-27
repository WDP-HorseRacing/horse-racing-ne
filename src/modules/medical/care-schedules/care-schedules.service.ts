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
  VET_APPOINTMENT_TYPES,
} from '../constants/care-schedule.enum';
import {
  CancelCareScheduleDto,
  CareScheduleResponseDto,
  CompleteCareScheduleDto,
  CompleteCareScheduleResponseDto,
  CreateCareScheduleDto,
  ReopenCareScheduleDto,
  UpdateCareScheduleDto,
} from '../dto';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { toCareScheduleResponse } from '../mappers/medical.mapper';
import {
  assertCareDueDate,
  assertCareScheduleOpen,
  assertCareScheduleReopenable,
  assertRescheduleReason,
} from '../policies/medical.policy';
import { toClubDate } from '../../../common/utils/club-date';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

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
   * - Không gồm ngày hẹn khám định kỳ và lịch tái khám
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
    const schedules = await this.schedules.find({
      where: { horseId, type: Not(In([...VET_APPOINTMENT_TYPES])) },
      order: { dueAt: 'ASC' },
    });
    return schedules.map(toCareScheduleResponse);
  }

  /**
   * Bác sĩ tạo lịch chăm sóc cho con ngựa
   *
   * - Khóa row ngựa; ngựa đã chuyển nhượng: 409
   * - Ngày đến hạn không ở quá khứ
   * - Người được giao phải là bác sĩ đang hoạt động; bỏ trống là chưa giao ai
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Loại, ngày đến hạn, người được giao, ghi chú
   * @returns Promise trả về lịch vừa tạo
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu ngày đến hạn ở quá khứ, hoặc người được giao không phải bác sĩ đang hoạt động
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
      const assignedTo = body.assignedTo ?? null;
      await this.assertAssignee(manager, assignedTo);
      const saved = await manager.save(
        manager.create(CareScheduleEntity, {
          horseId,
          type: body.type,
          dueAt,
          assignedTo,
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
   * Bác sĩ dời ngày, đổi bác sĩ được giao hoặc ghi chú của lịch chăm sóc
   *
   * - Chỉ lịch còn Đã lên lịch: 409
   * - Dời ngày bắt buộc lý do; ngày mới không ở quá khứ
   * - Đổi người được giao: phải là bác sĩ đang hoạt động; gửi null là bỏ giao
   * - Không có trường nào thay đổi thì không ghi gì, không ghi nhật ký
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param scheduleId UUID của lịch chăm sóc
   * @param body Các trường cần đổi và lý do
   * @returns Promise trả về lịch sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lịch, hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu dời ngày không có lý do, ngày ở quá khứ, hoặc người được giao mới không phải bác sĩ đang hoạt động
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
      const assignedTo =
        body.assignedTo !== undefined ? body.assignedTo : schedule.assignedTo;
      if (assignedTo !== schedule.assignedTo) {
        await this.assertAssignee(manager, assignedTo);
      }
      const changes = {
        dueAt,
        assignedTo,
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
   * Bác sĩ đánh dấu hoàn tất lịch chăm sóc, lưu thời điểm và người thực hiện
   *
   * - Chỉ lịch còn Đã lên lịch: 409
   * - Nhập ngày đến hạn lần tới: tạo luôn lịch mới cùng loại trong cùng transaction, giữ bác sĩ được giao (createNext)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param scheduleId UUID của lịch chăm sóc
   * @param body Ngày đến hạn lần tới (tùy chọn)
   * @returns Promise trả về lịch vừa hoàn tất và lịch lần tới (nếu có)
   * @throws NotFoundException Nếu không có lịch, hoặc ngựa ngoài phạm vi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
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
      assertCareScheduleOpen(schedule.status);
      const nextDueAt = body.nextDueAt ? new Date(body.nextDueAt) : null;
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
   * Bác sĩ mở lại lịch chăm sóc đã hoàn tất, bắt buộc lý do
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa rồi row lịch
   * - Không gồm ngày hẹn khám định kỳ và lịch tái khám: 404
   * - Lịch không ở Hoàn tất: 409
   * - Lịch về Đã lên lịch, bỏ thời điểm và người hoàn tất, giữ ngày đến hạn; lịch lần tới đã tạo lúc hoàn tất giữ nguyên
   * - Ghi nhật ký trạng thái, thời điểm và người hoàn tất trước/sau kèm lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param scheduleId UUID của lịch chăm sóc
   * @param body Lý do mở lại
   * @returns Promise trả về lịch sau khi mở lại
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lịch, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu lịch chưa hoàn tất hoặc đã hủy, hoặc ngựa đã chuyển nhượng hay đã mất
   */
  async reopen(
    actor: Actor,
    scheduleId: string,
    body: ReopenCareScheduleDto,
  ): Promise<CareScheduleResponseDto> {
    const { horseId } = await this.findSchedule(scheduleId);
    const reopened = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const schedule = await this.lockSchedule(manager, scheduleId);
      assertCareScheduleReopenable(schedule.status);
      const changes = {
        status: CareScheduleStatus.SCHEDULED,
        completedAt: null,
        completedBy: null,
      };
      await manager.update(CareScheduleEntity, { id: scheduleId }, changes);
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: scheduleId,
        before: {
          status: schedule.status,
          completedAt: schedule.completedAt,
          completedBy: schedule.completedBy,
        },
        after: changes,
        reason: body.reason,
        feature: MEDICAL_AUDIT_FEATURE.CARE_SCHEDULE,
      });
      return { ...schedule, ...changes };
    });
    return toCareScheduleResponse(reopened);
  }

  /**
   * Tạo lịch lần tới cùng loại sau khi hoàn tất, giữ bác sĩ được giao của lịch vừa hoàn tất
   *
   * - Bác sĩ đó không còn hoạt động: lịch lần tới chưa giao ai
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
    const assignedTo = (await this.isValidAssignee(manager, done.assignedTo))
      ? done.assignedTo
      : null;
    const next = await manager.save(
      manager.create(CareScheduleEntity, {
        horseId: done.horseId,
        type: done.type,
        dueAt,
        assignedTo,
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
   * Kiểm người được giao có phải bác sĩ đang hoạt động không
   *
   * @param manager EntityManager của transaction đang chạy
   * @param assignedTo UUID người được giao, null là chưa giao ai
   * @returns Promise hoàn tất khi kiểm xong; chưa giao ai thì không kiểm
   * @throws BadRequestException Nếu người được giao không phải bác sĩ đang hoạt động
   */
  private async assertAssignee(
    manager: EntityManager,
    assignedTo: string | null,
  ): Promise<void> {
    if (!(await this.isValidAssignee(manager, assignedTo))) {
      throw new BadRequestException(
        'Người được giao phải là Bác sĩ thú y đang hoạt động',
      );
    }
  }

  /**
   * Kiểm người được giao còn hợp lệ không
   *
   * - Chưa giao ai: luôn hợp lệ
   * - Có người: người đó là bác sĩ đang hoạt động
   *
   * @param manager EntityManager của transaction đang chạy
   * @param assignedTo UUID người được giao, null là chưa giao ai
   * @returns Promise trả về true nếu hợp lệ
   */
  private async isValidAssignee(
    manager: EntityManager,
    assignedTo: string | null,
  ): Promise<boolean> {
    if (assignedTo === null) return true;
    return manager.exists(UserEntity, {
      where: {
        id: assignedTo,
        status: UserStatus.ACTIVE,
        role: UserRole.VETERINARIAN,
      },
    });
  }

  /**
   * Tìm lịch chăm sóc (không gồm ngày hẹn khám định kỳ và lịch tái khám) theo id
   *
   * @param scheduleId UUID của lịch chăm sóc
   * @returns Promise trả về lịch chăm sóc
   * @throws NotFoundException Nếu không có lịch
   */
  private async findSchedule(scheduleId: string): Promise<CareScheduleEntity> {
    const schedule = await this.schedules.findOne({
      where: { id: scheduleId, type: Not(In([...VET_APPOINTMENT_TYPES])) },
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
      lock: { mode: 'for_no_key_update' },
    });
  }
}

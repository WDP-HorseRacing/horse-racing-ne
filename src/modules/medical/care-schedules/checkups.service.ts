import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
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
  CheckupAppointmentDto,
  CheckupItemDto,
  CheckupListQueryDto,
  SetCheckupAppointmentDto,
} from '../dto';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { toCheckupAppointment } from '../mappers/medical.mapper';
import {
  assertAppointmentDate,
  assertRescheduleReason,
  checkupStateOf,
} from '../policies/medical.policy';
import { toClubDate } from '../../../common/utils/club-date';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';
import { MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT } from '../constants/medical-events.constants';
import type { CheckupAppointmentChangedEvent } from '../types/medical-events.types';

@Injectable()
export class CheckupsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: MedicalAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly herdCheckups: MedicalCheckupsService,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Lịch khám định kỳ của cả đàn: hạn khám, trạng thái hạn và ngày hẹn, quá hạn lên đầu rồi tới đến hạn
   *
   * - Không tính ngựa đã chuyển nhượng và hồ sơ đã xóa
   * - Tính trực tiếp mỗi lần gọi theo ngày lịch câu lạc bộ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Lọc theo trạng thái hạn và khu
   * @returns Promise trả về hạn khám từng con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  async list(
    actor: Actor,
    query: CheckupListQueryDto,
  ): Promise<CheckupItemDto[]> {
    await this.horseAccess.currentUser(actor);
    const items = await this.herdCheckups.checkupItems({
      barnId: query.barnId,
    });
    return query.status
      ? items.filter((item) => item.dueStatus === query.status)
      : items;
  }

  /**
   * Bác sĩ đặt hoặc dời ngày hẹn khám định kỳ cho một con ngựa
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa; ngựa đã chuyển nhượng: 409
   * - Ngày hẹn không ở quá khứ; ngựa chưa quá hạn thì không muộn hơn hạn khám
   * - Mỗi ngựa một ngày hẹn đang hiệu lực: đã có thì là dời lịch, bắt buộc lý do
   * - Người đặt hoặc dời là bác sĩ phụ trách ngày hẹn (assignee VET)
   * - Dời ngày hẹn đang giao bác sĩ khác: phát MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT báo bác sĩ đó (nếu còn hoạt động)
   * - Ghi nhật ký kèm lý do khi dời
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Ngày giờ hẹn và lý do dời (nếu dời)
   * @returns Promise trả về ngày hẹn đang hiệu lực
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu ngày hẹn không hợp lệ, hoặc dời lịch không có lý do
   * @throws ConflictException Nếu ngựa đã chuyển nhượng
   */
  async setAppointment(
    actor: Actor,
    horseId: string,
    body: SetCheckupAppointmentDto,
  ): Promise<CheckupAppointmentDto> {
    const scheduledAt = new Date(body.scheduledAt);
    const saved = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const [anchors] = await this.herdCheckups.herdCheckupAnchors(
        { horseIds: [horseId] },
        manager,
      );
      const today = toClubDate(new Date());
      assertAppointmentDate(
        toClubDate(scheduledAt),
        today,
        checkupStateOf(anchors, today).dueDate,
      );
      const existing = (
        await this.herdCheckups.activeAppointments([horseId], manager)
      ).get(horseId);
      assertRescheduleReason(existing !== undefined, body.reason);

      const assignment = {
        dueAt: scheduledAt,
        assigneeType: CareAssigneeType.VET,
        assignedTo: caller.id,
      };
      let appointment: CareScheduleEntity;
      if (existing) {
        await manager.update(
          CareScheduleEntity,
          { id: existing.id },
          assignment,
        );
        appointment = { ...existing, ...assignment, assignee: caller };
        await this.notifyPreviousAssignee(
          manager,
          existing,
          caller,
          'RESCHEDULED',
          scheduledAt,
          body.reason ?? '',
        );
      } else {
        appointment = await manager.save(
          manager.create(CareScheduleEntity, {
            horseId,
            type: CareScheduleType.ROUTINE_CHECKUP,
            ...assignment,
            status: CareScheduleStatus.SCHEDULED,
            completedAt: null,
            completedBy: null,
            cancelReason: null,
            notes: null,
          }),
        );
        appointment.assignee = caller;
      }
      await this.audit.record(manager, {
        actorId: caller.id,
        action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: appointment.id,
        before: existing
          ? { dueAt: existing.dueAt, assignedTo: existing.assignedTo }
          : null,
        after: {
          horseId,
          type: CareScheduleType.ROUTINE_CHECKUP,
          dueAt: scheduledAt,
          assignedTo: caller.id,
        },
        reason: body.reason ?? null,
        feature: MEDICAL_AUDIT_FEATURE.CHECKUP_SCHEDULE,
      });
      return appointment;
    });
    return toCheckupAppointment(saved);
  }

  /**
   * Bác sĩ hủy ngày hẹn khám định kỳ đang hiệu lực của một con ngựa, bắt buộc lý do
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa; ngựa đã chuyển nhượng hoặc đã mất: 409
   * - Ngày hẹn chuyển Đã hủy kèm lý do, ghi nhật ký
   * - Hủy ngày hẹn đang giao bác sĩ khác: phát MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT báo bác sĩ đó (nếu còn hoạt động)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Lý do hủy
   * @returns Promise hoàn tất khi đã hủy
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa, ngựa ngoài phạm vi, hoặc ngựa không có ngày hẹn đang hiệu lực
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất
   */
  async cancelAppointment(
    actor: Actor,
    horseId: string,
    body: CancelCareScheduleDto,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const existing = (
        await this.herdCheckups.activeAppointments([horseId], manager)
      ).get(horseId);
      if (!existing) {
        throw new NotFoundException(
          'Ngựa không có ngày hẹn khám đang hiệu lực',
        );
      }
      await manager.update(
        CareScheduleEntity,
        { id: existing.id },
        { status: CareScheduleStatus.CANCELLED, cancelReason: body.reason },
      );
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: existing.id,
        before: { status: existing.status },
        after: { status: CareScheduleStatus.CANCELLED },
        reason: body.reason,
        feature: MEDICAL_AUDIT_FEATURE.CHECKUP_SCHEDULE,
      });
      await this.notifyPreviousAssignee(
        manager,
        existing,
        caller,
        'CANCELLED',
        existing.dueAt,
        body.reason,
      );
    });
  }

  /**
   * Báo bác sĩ đang phụ trách khi ngày hẹn của mình bị bác sĩ khác dời hoặc hủy
   *
   * - Ngày hẹn chưa giao ai, người đổi chính là người phụ trách, hoặc người phụ trách không còn là bác sĩ đang hoạt động: không phát gì
   *
   * @param manager EntityManager của transaction đang chạy
   * @param appointment Ngày hẹn trước khi đổi
   * @param caller Bác sĩ đang dời hoặc hủy
   * @param change Dời (RESCHEDULED) hay hủy (CANCELLED)
   * @param scheduledAt Ngày hẹn mới khi dời, ngày đã hẹn khi hủy
   * @param reason Lý do dời hoặc hủy
   * @returns Promise hoàn tất khi đã ghi event vào outbox (hoặc không cần báo)
   */
  private async notifyPreviousAssignee(
    manager: EntityManager,
    appointment: CareScheduleEntity,
    caller: UserEntity,
    change: CheckupAppointmentChangedEvent['change'],
    scheduledAt: Date,
    reason: string,
  ): Promise<void> {
    const previousAssigneeId = appointment.assignedTo;
    if (
      previousAssigneeId === null ||
      previousAssigneeId === caller.id ||
      !(await manager.exists(UserEntity, {
        where: {
          id: previousAssigneeId,
          status: UserStatus.ACTIVE,
          role: UserRole.VETERINARIAN,
        },
      }))
    ) {
      return;
    }
    const event: CheckupAppointmentChangedEvent = {
      eventId: randomUUID(),
      horseId: appointment.horseId,
      appointmentId: appointment.id,
      change,
      scheduledAt: scheduledAt.toISOString(),
      previousAssigneeId,
      changedByName: caller.fullName,
      reason,
    };
    await this.events.publish(
      manager,
      MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT,
      event,
    );
  }
}

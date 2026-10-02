import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import {
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
  toClubDate,
} from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

@Injectable()
export class CheckupsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: MedicalAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly herdCheckups: MedicalCheckupsService,
    private readonly audit: AuditService,
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

      let appointment: CareScheduleEntity;
      if (existing) {
        await manager.update(
          CareScheduleEntity,
          { id: existing.id },
          { dueAt: scheduledAt },
        );
        appointment = { ...existing, dueAt: scheduledAt };
      } else {
        appointment = await manager.save(
          manager.create(CareScheduleEntity, {
            horseId,
            type: CareScheduleType.ROUTINE_CHECKUP,
            dueAt: scheduledAt,
            assignedTo: null,
            status: CareScheduleStatus.SCHEDULED,
            completedAt: null,
            completedBy: null,
            cancelReason: null,
            notes: null,
          }),
        );
      }
      await this.audit.record(manager, {
        actorId: caller.id,
        action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: AuditEntityType.CARE_SCHEDULE,
        entityId: appointment.id,
        before: existing ? { dueAt: existing.dueAt } : null,
        after: {
          horseId,
          type: CareScheduleType.ROUTINE_CHECKUP,
          dueAt: scheduledAt,
        },
        reason: body.reason ?? null,
        feature: MEDICAL_AUDIT_FEATURE.CHECKUP_SCHEDULE,
      });
      return appointment;
    });
    return toCheckupAppointment(saved);
  }
}

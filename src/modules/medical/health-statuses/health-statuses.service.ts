import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseHealthService } from '../../horses/shared/horse-health.service';
import { MEDICAL_HEALTH_CHANGED_EVENT } from '../constants/medical-events.constants';
import {
  HealthHistoryItemDto,
  HealthStatusChangeResponseDto,
  UpdateHealthStatusDto,
} from '../dto';
import { assertHealthChangeReason } from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import type { HealthChangedEvent } from '../types/medical-events.types';
import { HealthStatusesRepository } from './health-statuses.repository';
import {
  toHealthHistoryItem,
  toHealthStatusChangeResponse,
} from '../mappers/medical.mapper';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

@Injectable()
export class HealthStatusesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: MedicalAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly horseHealth: HorseHealthService,
    private readonly repository: HealthStatusesRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Bác sĩ đổi trạng thái sức khỏe trực tiếp, không qua buổi khám (F3.7)
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa; ngựa đã chuyển nhượng: 409
   * - Bắt buộc lý do; trạng thái mới trùng trạng thái cũ thì không ghi gì và trả changed = false
   * - Được đặt Đủ điều kiện cả khi đang có lệnh khóa; không tự gỡ khóa (F3.7 mục 5)
   * - Chuyển sang Chấn thương hoặc Cách ly: sau commit báo Head Trainer của khu, Club Manager và Horse Owner
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Trạng thái mới và lý do
   * @returns A promise resolving to trạng thái trước, sau và cờ có thay đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu thiếu lý do
   * @throws ConflictException Nếu ngựa đã chuyển nhượng
   */
  async updateHealth(
    actor: Actor,
    horseId: string,
    body: UpdateHealthStatusDto,
  ): Promise<HealthStatusChangeResponseDto> {
    const change = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      assertHealthChangeReason(
        horse.healthStatus,
        body.healthStatus,
        body.reason,
      );
      return this.horseHealth.applyHealthStatus(manager, {
        horseId,
        to: body.healthStatus,
        actorId: caller.id,
        reason: body.reason,
        feature: MEDICAL_AUDIT_FEATURE.HEALTH_STATUS,
      });
    });
    if (change.changed) {
      const event: HealthChangedEvent = {
        eventId: randomUUID(),
        horseId,
        from: change.from,
        to: change.to,
      };
      this.events.publish(MEDICAL_HEALTH_CHANGED_EVENT, event);
    }
    return toHealthStatusChangeResponse(horseId, change);
  }

  /**
   * Lịch sử trạng thái sức khỏe của con ngựa, mới nhất lên trên (F3.10 mục 6)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to các lần đổi trạng thái sức khỏe
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async history(
    actor: Actor,
    horseId: string,
  ): Promise<HealthHistoryItemDto[]> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    return (await this.repository.history(horseId)).map(toHealthHistoryItem);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { deterministicUuid } from '../../../common/utils/deterministic-uuid';
import { INCIDENT_REMINDER_AFTER_HOURS } from '../constants/incident.constants';
import { IncidentStatus } from '../constants/incident-status.enum';
import { INCIDENT_STALE_EVENT } from '../constants/stable-events.constants';
import { IncidentEntity } from '../entities/incident.entity';
import type { IncidentStaleEvent } from '../types/stable-events.types';

const HOUR_MS = 3_600_000;

/**
 * Nhắc sự cố thường bị bỏ quên: còn mở quá hạn mà chưa chuyển bác sĩ
 */
@Injectable()
export class IncidentRemindersService {
  private readonly logger = new Logger(IncidentRemindersService.name);

  constructor(
    private readonly events: DomainEventPublisher,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Chạy mỗi 30 phút: nhắc các sự cố quá hạn
   *
   * - Lỗi chỉ được log, không làm dừng scheduler
   *
   * @returns Promise hoàn tất khi đã chạy xong
   */
  @Cron('*/30 * * * *', { name: 'stable-incident-reminders' })
  async runEvery30Minutes(): Promise<void> {
    try {
      const reminded = await this.remindStale(new Date());
      if (reminded > 0) this.logger.log(`Nhắc sự cố quá hạn: ${reminded}`);
    } catch (error) {
      this.logger.error('Nhắc sự cố quá hạn lỗi', error as Error);
    }
  }

  /**
   * Đánh dấu đã nhắc và ghi INCIDENT_STALE_EVENT cho mỗi sự cố còn OPEN, chưa nhắc, chưa có yêu cầu khám, mở từ INCIDENT_REMINDER_AFTER_HOURS giờ trước
   *
   * - Mỗi sự cố chỉ nhắc một lần; chạy lại không nhắc trùng
   *
   * @param now Thời điểm chạy
   * @returns Promise trả về số sự cố vừa nhắc
   */
  async remindStale(now: Date): Promise<number> {
    const cutoff = new Date(
      now.getTime() - INCIDENT_REMINDER_AFTER_HOURS * HOUR_MS,
    );
    return this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(IncidentEntity)
        .set({ remindedAt: now })
        .where('status = :open', { open: IncidentStatus.OPEN })
        .andWhere('reminded_at IS NULL')
        .andWhere('created_at <= :cutoff', { cutoff })
        .andWhere(
          'NOT EXISTS (SELECT 1 FROM medical_exam_requests r WHERE r.incident_id = incidents.id)',
        )
        .returning('id, horse_id, description, created_at')
        .execute();
      const rows = result.raw as {
        id: string;
        horse_id: string;
        description: string;
        created_at: Date;
      }[];
      for (const row of rows) {
        const event: IncidentStaleEvent = {
          eventId: deterministicUuid(`incident-stale:${row.id}`),
          incidentId: row.id,
          horseId: row.horse_id,
          description: row.description,
          hours: Math.floor(
            (now.getTime() - new Date(row.created_at).getTime()) / HOUR_MS,
          ),
        };
        await this.events.publish(manager, INCIDENT_STALE_EVENT, event);
      }
      return rows.length;
    });
  }
}

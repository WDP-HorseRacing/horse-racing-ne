import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IncidentStatus } from '../constants/incident-status.enum';
import { IncidentEntity } from '../entities/incident.entity';

/**
 * Ghi sự cố tại chuồng cho module khác, chạy trong transaction của nơi gọi
 */
@Injectable()
export class IncidentWritesService {
  /**
   * Đóng mọi sự cố đang mở của ngựa thay cho Head Trainer khi hồ sơ ngựa chuyển sang chỉ được xem
   *
   * - Không ghi người đóng (hệ thống đóng), không phát event
   * - Sự cố đã đóng giữ nguyên
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param resolution Kết quả xử lý ghi vào sự cố
   * @returns Promise trả về số sự cố vừa đóng
   */
  async closeOpenIncidentsByHorse(
    manager: EntityManager,
    horseId: string,
    resolution: string,
  ): Promise<number> {
    const result = await manager.getRepository(IncidentEntity).update(
      { horseId, status: IncidentStatus.OPEN },
      {
        status: IncidentStatus.RESOLVED,
        resolution,
        resolvedBy: null,
        resolvedAt: new Date(),
      },
    );
    return result.affected ?? 0;
  }
}

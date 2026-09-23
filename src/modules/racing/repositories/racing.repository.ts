import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  OPEN_REGISTRATION_STATUSES,
  UPCOMING_RACE_STATUSES,
} from '../constants/racing.constants';
import { RegistrationStatus } from '../constants/registration-status.enum';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';

@Injectable()
export class RacingRepository {
  constructor(
    @InjectRepository(RaceRegistrationEntity)
    private readonly registrations: Repository<RaceRegistrationEntity>,
  ) {}

  listResultsByHorse(horseId: string): Promise<RaceRegistrationEntity[]> {
    return this.registrations.find({
      select: {
        id: true,
        status: true,
        placing: true,
        timeSeconds: true,
        race: { id: true, name: true, scheduledAt: true, status: true },
      },
      where: { horseId },
      relations: { race: true },
      order: { race: { scheduledAt: 'DESC' } },
    });
  }

  /**
   * Hủy các đăng ký thi đấu chưa diễn ra của ngựa bằng cách chuyển sang WITHDRAWN (F1.8, giải nghệ)
   *
   * - Chỉ đụng đăng ký còn mở: PROPOSED, OWNER_APPROVED, MANAGER_CONFIRMED
   * - Chỉ đụng cuộc đua chưa diễn ra: PLANNED, OPEN; đua IN_PROGRESS/COMPLETED/CANCELLED giữ nguyên lịch sử
   * - Chạy trên `manager` của transaction bên gọi, không tự mở transaction, không publish event
   *
   * @param manager EntityManager của transaction đang chạy ở module gọi
   * @param horseId UUID của ngựa
   * @returns Promise trả về số đăng ký đã chuyển sang WITHDRAWN
   */
  async withdrawOpenRegistrationsByHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder()
      .update(RaceRegistrationEntity)
      .set({ status: RegistrationStatus.WITHDRAWN })
      .where('horse_id = :horseId', { horseId })
      .andWhere('status IN (:...open)', { open: OPEN_REGISTRATION_STATUSES })
      .andWhere(
        'race_id IN (SELECT id FROM races WHERE status IN (:...upcoming))',
        { upcoming: UPCOMING_RACE_STATUSES },
      )
      .execute();
    return result.affected ?? 0;
  }
}

import { Injectable } from '@nestjs/common';
import { CheckupItemDto } from '../dto/checkup.dto';
import { toCheckupAppointment } from '../mappers/medical.mapper';
import { checkupStateOf, toClubDate } from '../policies/medical.policy';
import {
  HerdFilter,
  HorseCheckupAnchorRow,
  MedicalSharedRepository,
} from './medical-shared.repository';

@Injectable()
export class MedicalCheckupsService {
  constructor(private readonly shared: MedicalSharedRepository) {}

  /**
   * Tính hạn khám và ngày hẹn cho các con ngựa theo bộ lọc, số ngày còn lại tăng dần (dùng chung cho F3.1 và F3.2)
   *
   * @param filter Bộ lọc đàn ngựa
   * @param today Hôm nay theo lịch câu lạc bộ, mặc định ngày hiện tại
   * @returns A promise resolving to hạn khám từng con ngựa
   */
  async checkupItems(
    filter: HerdFilter,
    today: string = toClubDate(new Date()),
  ): Promise<CheckupItemDto[]> {
    const rows = await this.shared.herdCheckupAnchors(filter);
    return this.checkupItemsFor(rows, today);
  }

  /**
   * Tính hạn khám và ngày hẹn từ các dòng đàn ngựa đã đọc sẵn, số ngày còn lại tăng dần
   *
   * @param rows Đàn ngựa kèm mốc tính hạn
   * @param today Hôm nay theo lịch câu lạc bộ
   * @returns A promise resolving to hạn khám từng con ngựa
   */
  async checkupItemsFor(
    rows: HorseCheckupAnchorRow[],
    today: string,
  ): Promise<CheckupItemDto[]> {
    const appointments = await this.shared.activeAppointments(
      rows.map((row) => row.horseId),
    );
    return rows
      .map((row) => {
        const appointment = appointments.get(row.horseId);
        return {
          horseId: row.horseId,
          horseName: row.horseName,
          barnId: row.barnId,
          healthStatus: row.healthStatus,
          lastVisitDate: row.lastVisitDate,
          ...checkupStateOf(row, today),
          appointment: appointment ? toCheckupAppointment(appointment) : null,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }
}

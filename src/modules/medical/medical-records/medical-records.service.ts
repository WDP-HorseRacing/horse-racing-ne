import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { toMedicalRecordResponse } from '../mappers/medical.mapper';

/**
 * Hồ sơ khám và đơn thuốc của ngựa (tab Bệnh án).
 */
@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    @InjectRepository(MedicalRecordEntity)
    private readonly records: Repository<MedicalRecordEntity>,
    @InjectRepository(PrescriptionEntity)
    private readonly prescriptions: Repository<PrescriptionEntity>,
  ) {}

  /**
   * Lấy danh sách hồ sơ khám của con ngựa kèm đơn thuốc.
   *
   * - Club Manager, Veterinarian: xem đầy đủ.
   * - Head Trainer: xem đầy đủ, toàn câu lạc bộ (F1.3: phạm vi xem của Head Trainer là toàn CLB).
   * - Groom: không xem (chặn ở controller).
   * - Horse Owner: chỉ ngựa đang sở hữu; đơn thuốc không có liều lượng, tần suất.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Danh sách hồ sơ khám kèm đơn thuốc
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listRecords(
    actor: Actor,
    horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    await this.horseAccess.findReadable(actor, horseId);
    const seesDosage = [
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
    ].some((role) => actor.roles.includes(role));
    const records = await this.records.find({
      where: { horseId },
      order: { examDate: 'DESC' },
    });
    const prescriptions = records.length
      ? await this.prescriptions.find({
          where: { medicalRecordId: In(records.map((record) => record.id)) },
          order: { startDate: 'DESC' },
        })
      : [];
    const prescriptionsByRecord = new Map<string, typeof prescriptions>();
    for (const prescription of prescriptions) {
      const recordPrescriptions =
        prescriptionsByRecord.get(prescription.medicalRecordId) ?? [];
      recordPrescriptions.push(prescription);
      prescriptionsByRecord.set(
        prescription.medicalRecordId,
        recordPrescriptions,
      );
    }
    return records.map((record) =>
      toMedicalRecordResponse(
        record,
        prescriptionsByRecord.get(record.id) ?? [],
        seesDosage,
      ),
    );
  }
}

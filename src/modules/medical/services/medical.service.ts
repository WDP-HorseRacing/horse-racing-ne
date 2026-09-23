import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import {
  toInjuryMarkerResponse,
  toMedicalRecordResponse,
} from '../mappers/medical.mapper';

@Injectable()
export class MedicalService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    @InjectRepository(MedicalRecordEntity)
    private readonly records: Repository<MedicalRecordEntity>,
    @InjectRepository(PrescriptionEntity)
    private readonly prescriptions: Repository<PrescriptionEntity>,
    @InjectRepository(InjuryMarkerEntity)
    private readonly injuries: Repository<InjuryMarkerEntity>,
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

  /**
   * Lấy danh sách vết thương của con ngựa.
   *
   * - Horse Owner xem đầy đủ như Veterinarian, nhưng chỉ với ngựa đang sở hữu.
   * - Head Trainer xem toàn câu lạc bộ (F1.3). Groom không xem (chặn ở controller).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Danh sách vết thương
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listInjuries(
    actor: Actor,
    horseId: string,
  ): Promise<InjuryMarkerResponseDto[]> {
    await this.horseAccess.findReadable(actor, horseId);
    const injuries = await this.injuries.find({
      where: { medicalRecord: { horseId } },
      order: { createdAt: 'DESC' },
    });
    return injuries.map(toInjuryMarkerResponse);
  }
}

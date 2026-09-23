import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { findReadableHorse } from '../../horses/utils/horse-access';
import { assertTrainerBarn } from '../../stable/utils/trainer-barn';
import { currentUserForActor } from '../../users/utils/current-user';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { toMedicalRecordResponse } from '../mappers/medical.mapper';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MedicalRecordsService {
  constructor(
    @InjectRepository(MedicalRecordEntity)
    private readonly recordsRepo: Repository<MedicalRecordEntity>,
    @InjectRepository(PrescriptionEntity)
    private readonly prescriptionsRepo: Repository<PrescriptionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy danh sách hồ sơ khám của con ngựa kèm đơn thuốc.
   *
   * - Club Manager, Veterinarian: xem đầy đủ.
   * - Head Trainer: xem đầy đủ, chỉ với ngựa trong khu mình phụ trách.
   * - Horse Owner: chỉ ngựa đang sở hữu; đơn thuốc không có liều lượng, tần suất.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Danh sách hồ sơ khám kèm đơn thuốc
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws ForbiddenException Nếu người gọi là Head Trainer mà ngựa không thuộc khu mình phụ trách
   */
  async listRecords(
    actor: Actor,
    horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await findReadableHorse(this.dataSource.manager, actor, caller.id, horseId);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
    const seesDosage = [
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
    ].some((role) => actor.roles.includes(role));
    const records = await this.recordsRepo.find({
      where: { horseId },
      order: { examDate: 'DESC' },
    });
    const recordIds = records.map((record) => record.id);
    const prescriptions = recordIds.length
      ? await this.prescriptionsRepo.find({
          where: { medicalRecordId: In(recordIds) },
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

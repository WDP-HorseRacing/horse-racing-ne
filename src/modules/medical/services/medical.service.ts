import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { findReadableHorse } from '../../horses/utils/horse-access';
import { assertTrainerBarn } from '../../stable/utils/trainer-barn';
import { currentUserForActor } from '../../users/utils/current-user';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import {
  toInjuryMarkerResponse,
  toMedicalRecordResponse,
} from '../mappers/medical.mapper';
import { MedicalRepository } from '../repositories/medical.repository';

@Injectable()
export class MedicalService {
  constructor(
    private readonly medicalRepository: MedicalRepository,
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
    const records = await this.medicalRepository.listRecordsByHorse(horseId);
    const prescriptions = await this.medicalRepository.listPrescriptions(
      records.map((record) => record.id),
    );
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
   * - Head Trainer chỉ xem ngựa trong khu mình phụ trách.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Danh sách vết thương
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws ForbiddenException Nếu người gọi là Head Trainer mà ngựa không thuộc khu mình phụ trách
   */
  async listInjuries(
    actor: Actor,
    horseId: string,
  ): Promise<InjuryMarkerResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await findReadableHorse(this.dataSource.manager, actor, caller.id, horseId);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
    const injuries = await this.medicalRepository.listInjuries(horseId);
    return injuries.map(toInjuryMarkerResponse);
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { assertTrainerBarn } from '../../stable/utils/trainer-barn';
import { currentUserForActor } from '../../users/utils/current-user';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { MedicalRepository } from '../repositories/medical.repository';

@Injectable()
export class MedicalService {
  constructor(
    private readonly medicalRepository: MedicalRepository,
    private readonly dataSource: DataSource,
  ) {}

  async listRecords(
    actor: Actor,
    horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
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
    return records.map((record) => ({
      id: record.id,
      examDate: record.examDate,
      diagnosis: record.diagnosis,
      severity: record.severity,
      resultingStatus: record.resultingStatus,
      vetId: record.vetId,
      voidedAt: record.voidedAt,
      prescriptions: (prescriptionsByRecord.get(record.id) ?? []).map(
        (prescription) => ({
          id: prescription.id,
          medicine: prescription.medicine,
          dosage: prescription.dosage,
          frequency: prescription.frequency,
          startDate: prescription.startDate,
          endDate: prescription.endDate,
        }),
      ),
    }));
  }

  async listInjuries(
    actor: Actor,
    horseId: string,
  ): Promise<InjuryMarkerResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
    const injuries = await this.medicalRepository.listInjuries(horseId);
    return injuries.map((injury) => ({
      id: injury.id,
      medicalRecordId: injury.medicalRecordId,
      bodyRegion: injury.bodyRegion,
      position: injury.position,
      injuryType: injury.injuryType,
      recoveryStatus: injury.recoveryStatus,
      notes: injury.notes,
    }));
  }
}

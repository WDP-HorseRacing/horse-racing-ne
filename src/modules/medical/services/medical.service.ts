import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { MedicalRepository } from '../repositories/medical.repository';

@Injectable()
export class MedicalService {
  constructor(private readonly medicalRepository: MedicalRepository) {}

  async listRecords(
    actor: Actor,
    horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    const records = await this.medicalRepository.listRecordsByHorse(
      horseId,
      actor.clubId,
    );
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
    const injuries = await this.medicalRepository.listInjuries(
      horseId,
      actor.clubId,
    );
    return injuries.map((injury) => ({
      id: injury.id,
      medicalRecordId: injury.medicalRecordId,
      bodyRegion: injury.bodyRegion,
      injuryType: injury.injuryType,
      recoveryStatus: injury.recoveryStatus,
      notes: injury.notes,
    }));
  }
}

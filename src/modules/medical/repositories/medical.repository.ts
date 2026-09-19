import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';

@Injectable()
export class MedicalRepository {
  constructor(
    @InjectRepository(MedicalRecordEntity)
    private readonly records: Repository<MedicalRecordEntity>,
    @InjectRepository(PrescriptionEntity)
    private readonly prescriptions: Repository<PrescriptionEntity>,
    @InjectRepository(InjuryMarkerEntity)
    private readonly injuries: Repository<InjuryMarkerEntity>,
  ) {}

  listRecordsByHorse(horseId: string): Promise<MedicalRecordEntity[]> {
    return this.records.find({
      where: { horseId },
      order: { examDate: 'DESC' },
    });
  }

  listPrescriptions(recordIds: string[]): Promise<PrescriptionEntity[]> {
    if (!recordIds.length) return Promise.resolve([]);
    return this.prescriptions.find({
      where: { medicalRecordId: In(recordIds) },
      order: { startDate: 'DESC' },
    });
  }

  listInjuries(horseId: string): Promise<InjuryMarkerEntity[]> {
    return this.injuries.find({
      where: { medicalRecord: { horseId } },
      order: { createdAt: 'DESC' },
    });
  }
}

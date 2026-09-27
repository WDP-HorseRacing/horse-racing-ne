import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorseMeasurementsModule } from '../../horses/horse-measurements/horse-measurements.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { MedicalCasesController } from './medical-cases.controller';
import { MedicalCasesRepository } from './medical-cases.repository';
import { MedicalCasesService } from './medical-cases.service';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
import { MedicalVisitsService } from './medical-visits.service';

/**
 * Owns medical visits and cases: recording, voiding, closing, cost and reports (F3.3, F3.5, F3.6, F3.9, F3.10).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MedicalRecordEntity,
      MedicalCaseEntity,
      PrescriptionEntity,
      InjuryMarkerEntity,
    ]),
    HorsesSharedModule,
    HorseMeasurementsModule,
    MedicalSharedModule,
    AuditModule,
  ],
  providers: [
    MedicalRecordsService,
    MedicalVisitsService,
    MedicalCasesService,
    MedicalCasesRepository,
  ],
  controllers: [MedicalRecordsController, MedicalCasesController],
})
export class MedicalRecordsModule {}

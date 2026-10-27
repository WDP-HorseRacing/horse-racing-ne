import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorseMeasurementsModule } from '../../horses/horse-measurements/horse-measurements.module';
import { HorseStatusesModule } from '../../horses/horse-statuses/horse-statuses.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { InjuryEntity } from '../entities/injury.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { MedicalCasesController } from './medical-cases.controller';
import { MedicalCasesRepository } from './medical-cases.repository';
import { MedicalCasesService } from './medical-cases.service';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
import { MedicalVisitEditsService } from './medical-visit-edits.service';
import { MedicalVisitWritesService } from './medical-visit-writes.service';
import { MedicalVisitsService } from './medical-visits.service';

/**
 * Quản lý buổi khám và bệnh án: ghi, hủy, đóng, chi phí và báo cáo.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MedicalRecordEntity,
      MedicalCaseEntity,
      PrescriptionEntity,
      InjuryMarkerEntity,
      InjuryEntity,
    ]),
    HorsesSharedModule,
    HorseMeasurementsModule,
    HorseStatusesModule,
    MedicalSharedModule,
    AuditModule,
  ],
  providers: [
    MedicalRecordsService,
    MedicalVisitsService,
    MedicalVisitWritesService,
    MedicalVisitEditsService,
    MedicalCasesService,
    MedicalCasesRepository,
  ],
  controllers: [MedicalRecordsController, MedicalCasesController],
})
export class MedicalRecordsModule {}

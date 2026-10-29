import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorseMeasurementsModule } from '../../horses/horse-measurements/horse-measurements.module';
import { HorseStatusesModule } from '../../horses/horse-statuses/horse-statuses.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { InjuryMarkerEntity } from '../entity/injury-marker.entity';
import { InjuryEntity } from '../entity/injury.entity';
import { MedicalCaseEntity } from '../entity/medical-case.entity';
import { MedicalRecordEntity } from '../entity/medical-record.entity';
import { PrescriptionEntity } from '../entity/prescription.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import {
  MedicalCasesController,
  MedicalRecordsController,
} from './controllers';
import {
  MedicalCasesService,
  MedicalRecordsService,
  MedicalVisitEditsService,
  MedicalVisitWritesService,
  MedicalVisitsService,
} from './services';
import { MedicalCasesRepository } from './repositories';

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

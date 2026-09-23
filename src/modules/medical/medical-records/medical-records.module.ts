import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordDetailsController } from './medical-record-details.controller';
import { MedicalRecordsService } from './medical-records.service';

/**
 * Owns the medical record and prescription workflows, including record details.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MedicalRecordEntity, PrescriptionEntity]),
  ],
  providers: [MedicalRecordsService],
  controllers: [MedicalRecordsController, MedicalRecordDetailsController],
})
export class MedicalRecordsModule {}

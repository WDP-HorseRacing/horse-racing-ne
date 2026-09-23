import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../horses/shared/horses-shared.module';
import { MedicalDetailsController } from './controllers/medical-details.controller';
import { MedicalController } from './controllers/medical.controller';
import { InjuryMarkerEntity } from './entities/injury-marker.entity';
import { MedicalRecordEntity } from './entities/medical-record.entity';
import { PrescriptionEntity } from './entities/prescription.entity';
import { TrainingLockEntity } from './entities/training-lock.entity';
import { MedicalService } from './services/medical.service';
import { TrainingLockService } from './services/training-locks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MedicalRecordEntity,
      PrescriptionEntity,
      InjuryMarkerEntity,
      TrainingLockEntity,
    ]),
    HorsesSharedModule,
  ],
  providers: [MedicalService, TrainingLockService],
  controllers: [MedicalController, MedicalDetailsController],
  exports: [TrainingLockService],
})
export class MedicalModule {}

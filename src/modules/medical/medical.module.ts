import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalDetailsController } from './controllers/medical-details.controller';
import { MedicalController } from './controllers/medical.controller';
import { InjuryMarkerEntity } from './entities/injury-marker.entity';
import { MedicalRecordEntity } from './entities/medical-record.entity';
import { PrescriptionEntity } from './entities/prescription.entity';
import { MedicalRepository } from './repositories/medical.repository';
import { MedicalService } from './services/medical.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MedicalRecordEntity,
      PrescriptionEntity,
      InjuryMarkerEntity,
    ]),
  ],
  providers: [MedicalRepository, MedicalService],
  controllers: [MedicalController, MedicalDetailsController],
})
export class MedicalModule {}

import { Module } from '@nestjs/common';
import { MedicalController } from './controllers/medical.controller';
import { MedicalDetailsController } from './controllers/medical-details.controller';

@Module({ controllers: [MedicalController, MedicalDetailsController] })
export class MedicalModule {}

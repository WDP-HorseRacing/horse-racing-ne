import { Module } from '@nestjs/common';
import { MedicalController } from './controllers/medical.controller';

@Module({ controllers: [MedicalController] })
export class MedicalModule {}

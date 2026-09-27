import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { ExamRequestsController } from './exam-requests.controller';
import { ExamRequestsService } from './exam-requests.service';
import { MeasurementAlertExamRequestListener } from './measurement-alert.listener';

/**
 * Owns the exam request queue (F3.4), including requests generated from measurement alerts.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MedicalExamRequestEntity]),
    HorsesSharedModule,
    MedicalSharedModule,
    AuditModule,
  ],
  controllers: [ExamRequestsController],
  providers: [ExamRequestsService, MeasurementAlertExamRequestListener],
  exports: [ExamRequestsService],
})
export class ExamRequestsModule {}

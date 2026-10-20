import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { ExamRequestsController } from './exam-requests.controller';
import { ExamRequestsService } from './exam-requests.service';

/**
 * Quản lý hàng đợi yêu cầu khám.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MedicalExamRequestEntity]),
    HorsesSharedModule,
    MedicalSharedModule,
    AuditModule,
  ],
  controllers: [ExamRequestsController],
  providers: [ExamRequestsService],
  exports: [ExamRequestsService],
})
export class ExamRequestsModule {}

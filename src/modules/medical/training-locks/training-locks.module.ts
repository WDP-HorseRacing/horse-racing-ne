import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { TrainingLocksController } from './training-locks.controller';
import { TrainingLockService } from './training-locks.service';

/**
 * Quản lý lệnh khóa huấn luyện do bác sĩ đặt, export hàm hệ thống tự gỡ khóa.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingLockEntity]),
    HorsesSharedModule,
    MedicalSharedModule,
    AuditModule,
  ],
  controllers: [TrainingLocksController],
  providers: [TrainingLockService],
  exports: [TrainingLockService],
})
export class TrainingLocksModule {}

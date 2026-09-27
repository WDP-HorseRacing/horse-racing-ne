import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { TrainingLocksController } from './training-locks.controller';
import { TrainingLockService } from './training-locks.service';

/**
 * Owns veterinary training locks (F3.8) and exports the system release used by lifecycle transfers (F1.8).
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

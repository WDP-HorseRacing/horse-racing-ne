import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { MedicalSharedModule } from '../../medical/shared/medical-shared.module';
import { TrainingLocksModule } from '../../medical/training-locks/training-locks.module';
import { GroomAssignmentsModule } from '../../stable/groom-assignments/groom-assignments.module';
import { StableSharedModule } from '../../stable/shared/stable-shared.module';
import { StallsModule } from '../../stable/stalls/stalls.module';
import { TrainingSharedModule } from '../../training/shared/training-shared.module';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorseStatusesController } from './horse-statuses.controller';
import { HorseStatusesRepository } from './horse-statuses.repository';
import { HorseStatusesService } from './horse-statuses.service';

@Module({
  imports: [
    HorsesSharedModule,
    AuditModule,
    StallsModule,
    GroomAssignmentsModule,
    StableSharedModule,
    TrainingLocksModule,
    MedicalSharedModule,
    TrainingSharedModule,
  ],
  controllers: [HorseStatusesController],
  providers: [HorseStatusesRepository, HorseStatusesService],
  exports: [HorseStatusesService],
})
export class HorseStatusesModule {}

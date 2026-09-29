import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { MedicalSharedModule } from '../../medical/shared/medical-shared.module';
import { TrainingLocksModule } from '../../medical/training-locks/training-locks.module';
import { RaceRegistrationsModule } from '../../racing/race-registrations/race-registrations.module';
import { GroomAssignmentsModule } from '../../stable/groom-assignments/groom-assignments.module';
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
    TrainingLocksModule,
    MedicalSharedModule,
    RaceRegistrationsModule,
    TrainingSharedModule,
  ],
  controllers: [HorseStatusesController],
  providers: [HorseStatusesRepository, HorseStatusesService],
})
export class HorseStatusesModule {}

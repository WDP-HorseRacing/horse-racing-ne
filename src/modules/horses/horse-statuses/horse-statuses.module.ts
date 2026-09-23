import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { MedicalModule } from '../../medical/medical.module';
import { RacingModule } from '../../racing/racing.module';
import { GroomAssignmentsModule } from '../../stable/groom-assignments/groom-assignments.module';
import { StallsModule } from '../../stable/stalls/stalls.module';
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
    MedicalModule,
    RacingModule,
  ],
  controllers: [HorseStatusesController],
  providers: [HorseStatusesRepository, HorseStatusesService],
})
export class HorseStatusesModule {}

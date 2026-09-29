import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { BarnsModule } from '../../stable/barns/barns.module';
import { GroomAssignmentsModule } from '../../stable/groom-assignments/groom-assignments.module';
import { StallsModule } from '../../stable/stalls/stalls.module';
import { TrainingSharedModule } from '../../training/shared/training-shared.module';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorsePlacementsController } from './horse-placements.controller';
import { HorsePlacementsRepository } from './horse-placements.repository';
import { HorsePlacementsService } from './horse-placements.service';

@Module({
  imports: [
    HorsesSharedModule,
    AuditModule,
    BarnsModule,
    StallsModule,
    GroomAssignmentsModule,
    TrainingSharedModule,
  ],
  controllers: [HorsePlacementsController],
  providers: [HorsePlacementsRepository, HorsePlacementsService],
})
export class HorsePlacementsModule {}

import { Module } from '@nestjs/common';
import { BarnsModule } from './barns/barns.module';
import { DailyChecklistsModule } from './daily-checklists/daily-checklists.module';
import { FeedingPlansModule } from './feeding-plans/feeding-plans.module';
import { GroomAssignmentsModule } from './groom-assignments/groom-assignments.module';
import { IncidentsModule } from './incidents/incidents.module';
import { StallsModule } from './stalls/stalls.module';

@Module({
  imports: [
    BarnsModule,
    StallsModule,
    GroomAssignmentsModule,
    FeedingPlansModule,
    DailyChecklistsModule,
    IncidentsModule,
  ],
  exports: [BarnsModule, StallsModule],
})
export class StableModule {}

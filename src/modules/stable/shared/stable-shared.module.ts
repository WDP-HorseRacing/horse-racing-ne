import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { DailyChecklistsService } from './daily-checklists.service';
import { IncidentWritesService } from './incident-writes.service';
import { StableLifecycleService } from './stable-lifecycle.service';
import { StableAccessService } from './stable-access.service';

@Module({
  imports: [HorsesSharedModule],
  providers: [
    StableAccessService,
    DailyChecklistsService,
    IncidentWritesService,
    StableLifecycleService,
  ],
  exports: [
    StableAccessService,
    DailyChecklistsService,
    IncidentWritesService,
    StableLifecycleService,
  ],
})
export class StableSharedModule {}

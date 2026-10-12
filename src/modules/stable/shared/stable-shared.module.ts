import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { DailyChecklistsService } from './daily-checklists.service';
import { IncidentWritesService } from './incident-writes.service';
import { StableAccessService } from './stable-access.service';

@Module({
  imports: [HorsesSharedModule],
  providers: [
    StableAccessService,
    DailyChecklistsService,
    IncidentWritesService,
  ],
  exports: [StableAccessService, DailyChecklistsService, IncidentWritesService],
})
export class StableSharedModule {}

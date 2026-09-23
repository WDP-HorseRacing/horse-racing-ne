import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { DailyChecklistsService } from './daily-checklists.service';
import { StableAccessService } from './stable-access.service';
import { StableSharedRepository } from './stable-shared.repository';

@Module({
  imports: [HorsesSharedModule],
  providers: [
    StableAccessService,
    StableSharedRepository,
    DailyChecklistsService,
  ],
  exports: [
    StableAccessService,
    StableSharedRepository,
    DailyChecklistsService,
  ],
})
export class StableSharedModule {}

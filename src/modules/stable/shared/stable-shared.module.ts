import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { DailyChecklistsService } from './daily-checklists.service';
import { StableAccessService } from './stable-access.service';

@Module({
  imports: [HorsesSharedModule],
  providers: [StableAccessService, DailyChecklistsService],
  exports: [StableAccessService, DailyChecklistsService],
})
export class StableSharedModule {}

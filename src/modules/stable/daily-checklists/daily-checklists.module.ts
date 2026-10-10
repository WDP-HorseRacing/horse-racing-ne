import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyChecklistItemEntity } from '../entities/daily-checklist-item.entity';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { ChecklistsService } from './checklists.service';
import { DailyChecklistsController } from './daily-checklists.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyChecklistEntity, DailyChecklistItemEntity]),
    StableSharedModule,
  ],
  controllers: [DailyChecklistsController],
  providers: [ChecklistsService],
})
export class DailyChecklistsModule {}

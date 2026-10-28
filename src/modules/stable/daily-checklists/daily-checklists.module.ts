import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { DailyChecklistItemEntity } from '../entities/daily-checklist-item.entity';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { ChecklistGenerationService } from './checklist-generation.service';
import { ChecklistsService } from './checklists.service';
import { DailyChecklistsController } from './daily-checklists.controller';
import { GroomTodayService } from './groom-today.service';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([DailyChecklistEntity, DailyChecklistItemEntity]),
    StableSharedModule,
  ],
  controllers: [DailyChecklistsController],
  providers: [ChecklistsService, ChecklistGenerationService, GroomTodayService],
})
export class DailyChecklistsModule {}

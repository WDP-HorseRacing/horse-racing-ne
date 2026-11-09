import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { MediaModule } from '../../media/media.module';
import { DailyChecklistItemEntity } from '../entities/daily-checklist-item.entity';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { DailyChecklistsController } from './controllers';
import {
  ChecklistGenerationService,
  ChecklistsService,
  GroomTodayService,
} from './services';

@Module({
  imports: [
    AuditModule,
    MediaModule,
    TypeOrmModule.forFeature([DailyChecklistEntity, DailyChecklistItemEntity]),
    StableSharedModule,
  ],
  controllers: [DailyChecklistsController],
  providers: [ChecklistsService, ChecklistGenerationService, GroomTodayService],
})
export class DailyChecklistsModule {}

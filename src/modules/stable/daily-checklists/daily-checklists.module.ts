import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { DailyChecklistsController } from './daily-checklists.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DailyChecklistEntity])],
  controllers: [DailyChecklistsController],
})
export class DailyChecklistsModule {}

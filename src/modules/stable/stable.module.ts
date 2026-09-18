import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarnsController } from './controllers/barns.controller';
import { DailyChecklistsController } from './controllers/daily-checklists.controller';
import { FeedingPlansController } from './controllers/feeding-plans.controller';
import { IncidentsController } from './controllers/incidents.controller';
import { StallsController } from './controllers/stalls.controller';
import { BarnEntity } from './entities/barn.entity';
import { StallAssignmentEntity } from './entities/stall-assignment.entity';
import { StallEntity } from './entities/stall.entity';
import { BarnsService } from './services/barns.service';
import { StallsService } from './services/stalls.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BarnEntity, StallEntity, StallAssignmentEntity]),
  ],
  providers: [BarnsService, StallsService],
  controllers: [
    BarnsController,
    StallsController,
    FeedingPlansController,
    DailyChecklistsController,
    IncidentsController,
  ],
  exports: [BarnsService, StallsService],
})
export class StableModule {}

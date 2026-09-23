import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { BarnsModule } from '../../stable/barns/barns.module';
import { StallsModule } from '../../stable/stalls/stalls.module';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorsePlacementsController } from './horse-placements.controller';
import { HorsePlacementsService } from './horse-placements.service';

@Module({
  imports: [HorsesSharedModule, AuditModule, BarnsModule, StallsModule],
  controllers: [HorsePlacementsController],
  providers: [HorsePlacementsService],
})
export class HorsePlacementsModule {}

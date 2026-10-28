import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { ReportsSharedModule } from '../shared/reports-shared.module';
import { HorseReportsController } from './horse-reports.controller';
import { HorseReportsRepository } from './horse-reports.repository';
import { HorseReportsService } from './horse-reports.service';

@Module({
  imports: [HorsesSharedModule, ReportsSharedModule],
  controllers: [HorseReportsController],
  providers: [HorseReportsService, HorseReportsRepository],
})
export class HorseReportsModule {}

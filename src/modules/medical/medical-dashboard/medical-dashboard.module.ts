import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { MedicalDashboardController } from './medical-dashboard.controller';
import { MedicalDashboardRepository } from './medical-dashboard.repository';
import { MedicalDashboardService } from './medical-dashboard.service';

/**
 * Owns the read-only medical dashboard (F3.1).
 */
@Module({
  imports: [HorsesSharedModule, MedicalSharedModule],
  controllers: [MedicalDashboardController],
  providers: [MedicalDashboardService, MedicalDashboardRepository],
})
export class MedicalDashboardModule {}

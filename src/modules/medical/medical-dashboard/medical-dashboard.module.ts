import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { MedicalDashboardController } from './medical-dashboard.controller';
import { MedicalDashboardRepository } from './medical-dashboard.repository';
import { MedicalDashboardService } from './medical-dashboard.service';

/**
 * Cung cấp bảng điều khiển y tế, chỉ đọc.
 */
@Module({
  imports: [HorsesSharedModule, MedicalSharedModule],
  controllers: [MedicalDashboardController],
  providers: [MedicalDashboardService, MedicalDashboardRepository],
})
export class MedicalDashboardModule {}

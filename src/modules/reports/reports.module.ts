import { Module } from '@nestjs/common';
import { ClubReportsModule } from './club-reports/club-reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HorseReportsModule } from './horse-reports/horse-reports.module';

/**
 * Lắp ráp các báo cáo: dashboard CLB, báo cáo từng ngựa, báo cáo CLB
 */
@Module({
  imports: [DashboardModule, HorseReportsModule, ClubReportsModule],
})
export class ReportsModule {}

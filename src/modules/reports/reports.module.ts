import { Module } from '@nestjs/common';
import { DashboardModule } from './dashboard/dashboard.module';
import { FinanceReportsModule } from './finance-reports/finance-reports.module';
import { HorseReportsModule } from './horse-reports/horse-reports.module';

/**
 * Lắp ráp các báo cáo: dashboard CLB, báo cáo từng ngựa, báo cáo tài chính
 */
@Module({
  imports: [DashboardModule, HorseReportsModule, FinanceReportsModule],
})
export class ReportsModule {}

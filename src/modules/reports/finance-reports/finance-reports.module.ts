import { Module } from '@nestjs/common';
import { FinanceReportsController } from './finance-reports.controller';
import { FinanceReportsRepository } from './finance-reports.repository';
import { FinanceReportsService } from './finance-reports.service';

@Module({
  controllers: [FinanceReportsController],
  providers: [FinanceReportsService, FinanceReportsRepository],
})
export class FinanceReportsModule {}

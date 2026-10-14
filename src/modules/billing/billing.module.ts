import { Module } from '@nestjs/common';
import { DailyFeesModule } from './daily-fees/daily-fees.module';

/**
 * Lắp ráp các khoản phí CLB thu chủ ngựa
 */
@Module({ imports: [DailyFeesModule] })
export class BillingModule {}

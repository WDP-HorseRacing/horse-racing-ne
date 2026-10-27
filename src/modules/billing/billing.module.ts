import { Module } from '@nestjs/common';
import { DailyFeesModule } from './daily-fees/daily-fees.module';
import { HorseSurchargesModule } from './horse-surcharges/horse-surcharges.module';

/**
 * Lắp ráp các khoản phí CLB thu chủ ngựa
 */
@Module({ imports: [DailyFeesModule, HorseSurchargesModule] })
export class BillingModule {}

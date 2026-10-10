import { Module } from '@nestjs/common';
import { SupplyStockService } from './supply-stock.service';

@Module({
  providers: [SupplyStockService],
  exports: [SupplyStockService],
})
export class SuppliesSharedModule {}

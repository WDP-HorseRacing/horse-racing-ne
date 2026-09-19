import { Module } from '@nestjs/common';
import { SupplyItemsModule } from './items/items.module';
import { SupplyRequestsModule } from './requests/requests.module';

@Module({ imports: [SupplyItemsModule, SupplyRequestsModule] })
export class SuppliesModule {}

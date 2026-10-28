import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyLotEntity } from '../entities/supply-lot.entity';
import { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';
import { SuppliesSharedModule } from '../shared/supplies-shared.module';
import { SupplyItemsController } from './items.controller';
import { SupplyItemsService } from './items.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplyItemEntity,
      SupplyStockMovementEntity,
      SupplyLotEntity,
    ]),
    SuppliesSharedModule,
    AuditModule,
  ],
  controllers: [SupplyItemsController],
  providers: [SupplyItemsService],
})
export class SupplyItemsModule {}

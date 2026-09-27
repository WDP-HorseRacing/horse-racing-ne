import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyItemsController } from './items.controller';
import { SupplyItemsService } from './items.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupplyItemEntity])],
  controllers: [SupplyItemsController],
  providers: [SupplyItemsService],
})
export class SupplyItemsModule {}

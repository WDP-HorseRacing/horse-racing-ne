import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyItemsController } from './items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SupplyItemEntity])],
  controllers: [SupplyItemsController],
})
export class SupplyItemsModule {}

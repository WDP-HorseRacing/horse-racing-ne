import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SupplyRequestsController } from './requests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SupplyRequestEntity])],
  controllers: [SupplyRequestsController],
})
export class SupplyRequestsModule {}

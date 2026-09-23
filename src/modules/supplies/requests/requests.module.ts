import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SupplyRequestsController } from './requests.controller';
import { SupplyRequestsService } from './requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupplyRequestEntity])],
  controllers: [SupplyRequestsController],
  providers: [SupplyRequestsService],
})
export class SupplyRequestsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SuppliesSharedModule } from '../shared/supplies-shared.module';
import { SupplyRequestsController } from './requests.controller';
import { SupplyRequestsService } from './requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupplyRequestEntity]),
    SuppliesSharedModule,
  ],
  controllers: [SupplyRequestsController],
  providers: [SupplyRequestsService],
})
export class SupplyRequestsModule {}

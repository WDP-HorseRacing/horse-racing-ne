import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { HorseSurchargeEntity } from '../entities/horse-surcharge.entity';
import { HorseSurchargesController } from './horse-surcharges.controller';
import { HorseSurchargesService } from './horse-surcharges.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HorseSurchargeEntity]),
    AuditModule,
    HorsesSharedModule,
  ],
  controllers: [HorseSurchargesController],
  providers: [HorseSurchargesService],
})
export class HorseSurchargesModule {}

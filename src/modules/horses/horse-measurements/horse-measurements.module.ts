import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorseMeasurementsController } from './horse-measurements.controller';
import { HorseMeasurementsRepository } from './horse-measurements.repository';
import { HorseMeasurementsService } from './horse-measurements.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HorseMeasurementEntity]),
    HorsesSharedModule,
    AuditModule,
  ],
  controllers: [HorseMeasurementsController],
  providers: [HorseMeasurementsRepository, HorseMeasurementsService],
})
export class HorseMeasurementsModule {}

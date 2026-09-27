import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { HealthStatusesController } from './health-statuses.controller';
import { HealthStatusesRepository } from './health-statuses.repository';
import { HealthStatusesService } from './health-statuses.service';

/**
 * Owns direct health status changes and the health history (F3.7, F3.10).
 */
@Module({
  imports: [HorsesSharedModule, MedicalSharedModule],
  controllers: [HealthStatusesController],
  providers: [HealthStatusesService, HealthStatusesRepository],
})
export class HealthStatusesModule {}
